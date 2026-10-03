// AI 骨架偵測的背景執行緒（Web Worker）
// 為什麼：AI 每偵測一格要花幾十毫秒，放在主畫面的執行緒上，這段時間按鈕、文字、骨架都會卡住；
// 搬到背景執行緒後，主畫面只負責把鏡頭畫面送過來、把結果畫出來。實測主執行緒的忙碌時間從 87% 降到 12%
//
// 和主畫面溝通的訊息（type）：
//   收到：init（下載來源、要用 GPU 或 CPU）、model-chunk／model-done（骨架模型邊下載邊送來）、detect（一格畫面）
//   送出：hello（是否支援 GPU）、bytes（AI 引擎下載進度）、engine-done、created（建好偵測器）、ready（暖機完成）、
//         result（偵測結果）、detect-error、fatal（無法啟動）
// 這是一般的 Worker（不是 module），所以用 importScripts 載入 MediaPipe，不能 import 網站其他的檔案

let landmarker = null;
let gl = null;          // GPU 模式時，MediaPipe 用的繪圖資源；用來檢查 GPU 有沒有被系統收回
let lastTs = 0;         // MediaPipe 要求每一格的時間一定要比上一格大
let modelController = null;
let modelComplete = false;  // 模型全部送完了
let modelError = '';        // 模型下載失敗的原因
const modelChunks = [];     // 收到的模型片段（ArrayBuffer），GPU 失敗改用 CPU、或之後重新建立時用

// 一開始先回報這台裝置的背景執行緒能不能用 GPU（有些瀏覽器只能在主畫面用 GPU）
self.postMessage({ type: 'hello', webgl: supportsWebGL() });

function supportsWebGL() {
    try {
        const c = new OffscreenCanvas(1, 1);
        const ctx = c.getContext('webgl2') || c.getContext('webgl');
        if (!ctx) return false;
        const lose = ctx.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return true;
    } catch (err) {
        return false;
    }
}

self.onmessage = event => {
    const m = event.data;
    if (m.type === 'init') init(m).catch(err => fatal(err));
    else if (m.type === 'model-chunk') {
        modelChunks.push(m.chunk);
        if (modelController) modelController.enqueue(new Uint8Array(m.chunk));
    } else if (m.type === 'model-done') {
        modelComplete = true;
        if (modelController) modelController.close();
    } else if (m.type === 'model-error') {
        modelError = m.message;
        if (modelController) modelController.error(new Error(m.message));
    } else if (m.type === 'detect') detect(m);
};

function fatal(err) {
    self.postMessage({ type: 'fatal', message: String(err && err.message || err) });
}

// 下載 MediaPipe 程式：依序試每個下載來源（主畫面已經依重試次數排好順序）
function importMediaPipe(bases, attempt) {
    let lastErr;
    for (const base of bases) {
        try {
            importScripts(base + '/vision_bundle.js' + (attempt ? '?retry=' + attempt : ''));
            return base;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('MediaPipe 下載失敗');
}

// MediaPipe 下載 AI 引擎時順便計算下載了多少，回報給主畫面顯示進度、判斷是否卡住
function countEngineDownload(url) {
    const realFetch = self.fetch;
    self.fetch = async (input, init) => {
        const res = await realFetch(input, init);
        if (String(input) !== url || !res.body) return res;
        let received = 0;
        const counted = res.body.pipeThrough(new TransformStream({
            transform(chunk, controller) {
                received += chunk.length;
                self.postMessage({ type: 'bytes', received: received });
                controller.enqueue(chunk);
            },
            flush() { self.postMessage({ type: 'engine-done' }); }
        }));
        return new Response(counted, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
}

let fileset = null;

// 建立偵測器；model：下載中的模型（reader）或完整的模型檔（Uint8Array）
async function create(delegate, model) {
    const canvas = delegate === 'GPU' ? new OffscreenCanvas(1, 1) : null;
    const created = await self.Vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate: delegate },
        ...(canvas ? { canvas: canvas } : {}),
        runningMode: 'VIDEO',
        numPoses: 1
    });
    gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    return created;
}

function fullModel() {
    const size = modelChunks.reduce((s, c) => s + c.byteLength, 0);
    const data = new Uint8Array(size);
    let offset = 0;
    for (const c of modelChunks) {
        data.set(new Uint8Array(c), offset);
        offset += c.byteLength;
    }
    return data;
}

// init：{ bases（下載來源，依序嘗試）, attempt（第幾次重試）, delegate：'GPU' 或 'CPU', model（重新啟動時直接給完整模型檔） }
async function init(m) {
    const base = importMediaPipe(m.bases, m.attempt);
    fileset = await self.Vision.FilesetResolver.forVisionTasks(base + '/wasm');
    if (m.attempt) fileset.wasmLoaderPath += '?retry=' + m.attempt;
    countEngineDownload(fileset.wasmBinaryPath);

    // 模型邊下載邊交給 MediaPipe（和 AI 引擎的下載同時進行，不用等模型全部下載完）
    let reader;
    if (m.model) {
        modelChunks.push(m.model);
        modelComplete = true;
        reader = new Uint8Array(m.model);
    } else {
        reader = new ReadableStream({ start(c) { modelController = c; } }).getReader();
        for (const chunk of modelChunks) modelController.enqueue(new Uint8Array(chunk));  // init 之前就送到的部分
        if (modelComplete) modelController.close();
    }

    let delegate = m.delegate;
    let reason = '';
    try {
        landmarker = await create(delegate, reader);
    } catch (err) {
        if (delegate !== 'GPU') throw err;
        // GPU 建不起來：改用 CPU（要等模型完整下載完，因為剛才那份已經被讀過了）
        reason = String(err && err.message || err);
        await modelDone();
        delegate = 'CPU';
        landmarker = await create('CPU', fullModel());
    }
    self.postMessage({ type: 'created', delegate: delegate, gpuError: reason });

    // 暖機：第一次偵測特別慢，先用一張空白小圖跑一次
    const t0 = performance.now();
    try {
        const blank = new OffscreenCanvas(64, 64);
        blank.getContext('2d').fillRect(0, 0, 64, 64);
        landmarker.detectForVideo(blank.transferToImageBitmap(), nextTs(performance.now()));
    } catch (err) {
        // 暖機失敗不影響使用
    }
    self.postMessage({ type: 'ready', warmupMs: performance.now() - t0 });
}

// 等模型全部送完（GPU 失敗改用 CPU 時用）；模型下載失敗就不用等了，直接回報失敗（主畫面會重試）
function modelDone() {
    if (modelComplete) return Promise.resolve();
    if (modelError) return Promise.reject(new Error(modelError));
    return new Promise((resolve, reject) => {
        const check = event => {
            if (event.data.type === 'model-done' || event.data.type === 'model-error') {
                self.removeEventListener('message', check);
                if (event.data.type === 'model-done') resolve();
                else reject(new Error(event.data.message));
            }
        };
        self.addEventListener('message', check);
    });
}

function nextTs(ts) {
    lastTs = ts > lastTs ? ts : lastTs + 1;
    return lastTs;
}

// 偵測一格：bitmap 是主畫面送來的鏡頭畫面，用完要釋放
function detect(m) {
    try {
        if (!landmarker) throw new Error('偵測器還沒準備好');
        const r = landmarker.detectForVideo(m.bitmap, nextTs(m.ts));
        self.postMessage({
            type: 'result', id: m.id,
            landmarks: r.landmarks[0] || null,
            world: (r.worldLandmarks && r.worldLandmarks[0]) || null,
            lost: !!gl && gl.isContextLost()
        });
    } catch (err) {
        self.postMessage({ type: 'detect-error', id: m.id, message: String(err && err.message || err), lost: !!gl && gl.isContextLost() });
    } finally {
        m.bitmap.close();
    }
}
