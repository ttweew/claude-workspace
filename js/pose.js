// AI 骨架偵測：下載 MediaPipe 與骨架模型、選擇 GPU 或 CPU、暖機
// 這裡只負責準備好偵測器，畫面上的文字由 main.js 負責

import { hasWebGL2 } from './support.js';
import { MEDIAPIPE_URLS, POSE_MODEL_URL, POSE_MODEL_SIZE, FORCE_CPU, USE_WORKER } from './config.js';
import { getGpuInfo, shortGpuName } from './gpu.js';

// 兩個要下載的大檔案（解壓縮後的大小），用來計算整體下載進度
// 伺服器回報的檔案大小可能是壓縮後的，不準，所以直接用固定版本的實際大小
const ENGINE_SIZE = 11.8e6;  // AI 引擎（WebAssembly）
const MODEL_SIZE = POSE_MODEL_SIZE;  // 骨架模型

// 下載卡住的判斷：網路斷斷續續時，下載可能停住卻不報錯，進度條就一直停在同一格
const STALL_MS = 15000;          // 下載中超過 15 秒完全沒收到資料 → 放棄這次，交給 main.js 重試
const IMPORT_TIMEOUT_MS = 20000; // MediaPipe 程式（約 150 KB）20 秒還沒下載完 → 改用下一個下載來源

// 下載卡住偵測：每收到資料就呼叫 kick()；超過 STALL_MS 沒有 kick 就呼叫 onStall()
// 網頁在背景時（切到別的 App、螢幕關掉）手機可能暫停網路，這段時間不算
// hold(promise)：這件事有自己的時限（例如下載 MediaPipe 程式），等它的期間不算卡住
function stallWatch(onStall) {
    let last = performance.now();
    let holding = 0;
    const kick = () => { last = performance.now(); };
    const timer = setInterval(() => {
        if (document.hidden || holding) kick();
        else if (performance.now() - last > STALL_MS) {
            stop();
            onStall();
        }
    }, 1000);
    document.addEventListener('visibilitychange', kick);
    function stop() {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', kick);
    }
    function hold(promise) {
        holding++;
        promise.then(() => {}, () => {}).then(() => { holding--; kick(); });
        return promise;
    }
    return { kick: kick, stop: stop, hold: hold };
}

// 自己下載骨架模型，才能邊下載邊回報進度；網頁一打開就開始下載，和 AI 引擎同時進行
// onBytes(已下載位元組數)：每收到一段資料就通知一次
// 回傳：
//   finished：下載完成後的完整檔案（Uint8Array；改用 CPU、重新啟動時使用）
//   subscribe({ chunk, done, error })：邊下載邊拿到每一段（先補上已經收到的部分）
//   reader()：邊下載邊讀的 reader，交給在主畫面執行的 MediaPipe
//   abort()：下載卡住時中止
function startModelDownload(onBytes) {
    const aborter = new AbortController();
    const chunks = [];
    const listeners = new Set();
    let status = 'loading', failure = null;
    const finished = (async () => {
        const res = await fetch(POSE_MODEL_URL, { signal: aborter.signal });
        if (!res.ok) throw new Error('骨架模型下載失敗（HTTP ' + res.status + '）');
        const reader = res.body.getReader();
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            onBytes(received);
            listeners.forEach(l => l.chunk(value));
        }
        const data = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }
        status = 'done';
        listeners.forEach(l => l.done());
        return data;
    })();
    finished.catch(err => {
        status = 'error';
        failure = err;
        listeners.forEach(l => l.error(err));
    });
    function subscribe(listener) {
        chunks.forEach(c => listener.chunk(c));
        if (status === 'done') listener.done();
        else if (status === 'error') listener.error(failure);
        else listeners.add(listener);
    }
    function reader() {
        return new ReadableStream({
            start(c) { subscribe({ chunk: v => c.enqueue(v), done: () => c.close(), error: e => c.error(e) }); }
        }).getReader();
    }
    return { finished: finished, subscribe: subscribe, reader: reader, abort: () => aborter.abort() };
}

// 把兩個檔案的下載量合併成一個整體進度（0～1）；檔案下載完之前最多算到 99%，不會提早顯示完成
function downloadTracker(onChange) {
    const files = { engine: { size: ENGINE_SIZE, received: 0, done: false },
                    model: { size: MODEL_SIZE, received: 0, done: false } };
    function report() {
        let sum = 0, total = 0;
        for (const f of Object.values(files)) {
            sum += f.done ? f.size : Math.min(f.received, f.size * 0.99);
            total += f.size;
        }
        onChange(sum / total);
    }
    return {
        bytes: name => received => {
            if (files[name].done) return;  // 改用 CPU 重試時會再讀一次引擎，不用重算
            files[name].received = received;
            report();
        },
        done: name => () => { files[name].done = true; report(); }
    };
}

// 暫時接手瀏覽器的 fetch：MediaPipe 下載 AI 引擎時，每收到一段資料就回報 onBytes
// 回傳 { finished：引擎下載完成, abort()：下載卡住時中止, restore()：讓 fetch 恢復原狀 }
function countEngineDownload(url, onBytes) {
    const realFetch = window.fetch;
    const aborter = new AbortController();
    let retired = false;
    let onDone;
    const finished = new Promise(resolve => { onDone = resolve; });
    const counting = async (input, init) => {
        if (retired || String(input) !== url) return realFetch(input, init);
        // 加上我們自己的中止開關；MediaPipe 原本有傳中止開關的話也照樣有效
        const signal = init && init.signal;
        if (signal) signal.addEventListener('abort', () => aborter.abort(), { once: true });
        const res = await realFetch(input, { ...init, signal: aborter.signal });
        if (!res.body) return res;
        let received = 0;
        const counted = res.body.pipeThrough(new TransformStream({
            transform(chunk, controller) {
                received += chunk.length;
                onBytes(received);
                controller.enqueue(chunk);
            },
            flush() { onDone(); }
        }));
        return new Response(counted, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
    window.fetch = counting;
    // 恢復原狀：只在 fetch 還是我們接手的那個時才換回來，不會蓋掉之後重試時新接手的 fetch；
    // 換不回來（已經被新的接手蓋在上面）也沒關係，retired 之後一律直接交給原本的 fetch
    function restore() {
        retired = true;
        if (window.fetch === counting) window.fetch = realFetch;
    }
    return {
        finished: finished,
        // 下載卡住時中止。MediaPipe 發現下載失敗會馬上換個方式再下載一次，
        // 所以 1 秒後才恢復 fetch，讓那次也被擋下來，不會在背景多下載 12 MB、和重試搶網路
        abort: () => {
            aborter.abort();
            setTimeout(restore, 1000);
        },
        restore: restore
    };
}

// 下載 MediaPipe 程式：依序嘗試每個下載來源，回傳成功的那一個 { base, vision }
// attempt：第幾次重試。瀏覽器會記住「這個網址下載失敗」，重試時網址後面加上次數，才會真的重新下載
async function importMediaPipe(attempt) {
    let lastErr;
    for (const base of MEDIAPIPE_URLS) {
        let timer;
        try {
            // 下載來源沒回應時，import 可能一直等下去，所以設定時限，超過就改用下一個來源
            const timeout = new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(new Error('下載逾時（' + IMPORT_TIMEOUT_MS / 1000 + ' 秒）')), IMPORT_TIMEOUT_MS);
            });
            const vision = await Promise.race([import(base + '/vision_bundle.mjs' + (attempt ? '?retry=' + attempt : '')), timeout]);
            return { base: base, vision: vision };
        } catch (err) {
            lastErr = err;
            console.warn('MediaPipe 下載失敗，改用下一個來源：', base, err);
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

// 讓瀏覽器有機會先把畫面上的文字更新出來，再做會卡住畫面的工作
function letScreenUpdate() {
    return new Promise(resolve => setTimeout(resolve, 50));
}

// 建立骨架偵測器，回傳 { landmarker, lost() }
// model：下載中的模型（reader）或已下載完成的模型檔（Uint8Array）
// GPU 模式由我們自己準備畫布交給 MediaPipe，才能隨時檢查 GPU 還在不在：
// 手機切到背景、螢幕鎖定或記憶體不足時，系統可能收回 GPU，之後偵測不會報錯，只會一直找不到人
// lost() 為 true 代表這個偵測器已經不能用，要重新建立
async function createPoseLandmarker(vision, fileset, delegate, model) {
    const canvas = delegate === 'GPU'
        ? (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'))
        : null;
    const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate: delegate },
        ...(canvas ? { canvas: canvas } : {}),
        runningMode: 'VIDEO',
        numPoses: 1
    });
    // 建好之後再向同一張畫布要 WebGL，拿到的就是 MediaPipe 正在用的那一個
    const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    return { landmarker: landmarker, lost: () => !!gl && gl.isContextLost() };
}

// 暖機：先用一張空白小圖跑一次偵測。第一次偵測特別慢，提早在首頁把這段時間花掉，
// 按下「開啟鏡頭」後骨架就能馬上出現
function warmUp(landmarker) {
    try {
        const blank = document.createElement('canvas');
        blank.width = 64;
        blank.height = 64;
        blank.getContext('2d').fillRect(0, 0, 64, 64);
        landmarker.detectForVideo(blank, performance.now());
    } catch (err) {
        console.warn('暖機失敗，不影響使用：', err);
    }
}

// 載入 MediaPipe 與骨架模型，回傳準備好的偵測器
// attempt：第幾次重試（第一次為 0）
// onProgress({ stage, fraction, delegate })：目前進行到哪個階段
//   stage：'download' 下載檔案（fraction 為 0～1 的整體下載進度）、'start' 啟動 AI、'warmup' 暖機
// 回傳 { computeMode, computeDetail, gpuName, timings, background, detect(), lostReason(), restart() }
//   background：是否在背景執行緒運算；detect(video, 時間) 回傳 Promise { landmarks, world }
//   computeMode：'GPU' 或 'CPU'；computeDetail：GPU 時為晶片名稱，CPU 時為原因
//   timings：各階段花費的秒數 { download, start, warmup }，用來找出載入慢在哪裡
// 下載卡住（STALL_MS 沒收到資料）時直接失敗，由 main.js 等幾秒後重試
export async function loadPoseModel(onProgress, attempt = 0) {
    // 沒有 WebGL2 的瀏覽器跑不了 MediaPipe（就算用 CPU 也一樣），開鏡頭後才會中止；一開始就說清楚，也不用重試
    if (!hasWebGL2()) {
        const err = new Error('這個瀏覽器不支援 WebGL2，無法執行 AI');
        err.unsupported = true;
        throw err;
    }
    const state = { abandoned: false, aborts: [] };
    let stalled;
    const stall = new Promise((resolve, reject) => { stalled = reject; });
    const watch = stallWatch(() => {
        state.abandoned = true;
        state.aborts.forEach(abort => abort());
        stalled(new Error('下載停住了：超過 ' + STALL_MS / 1000 + ' 秒沒有收到任何資料'));
    });
    // 放棄之後（失敗、卡住）還在跑的下載不再回報進度，不會把畫面上「載入失敗」的訊息蓋回「下載中」
    const report = progress => {
        if (!state.abandoned) onProgress(progress);
    };
    const loading = load(report, attempt, watch, state);
    loading.catch(() => {});  // 卡住放棄之後，原本那次載入的失敗不用再處理
    try {
        return await Promise.race([loading, stall]);
    } catch (err) {
        // 任何原因失敗（不只是卡住）：停掉這次還在跑的下載（例如模型），不在背景繼續浪費流量
        if (!state.abandoned) {
            state.abandoned = true;
            state.aborts.forEach(abort => abort());
        }
        throw err;
    } finally {
        watch.stop();
    }
}

// 這次載入已經因為下載卡住而放棄：停在這裡，不再往下做（避免在背景繼續下載、和重試搶網路）
function checkAbandoned(state) {
    if (state.abandoned) throw new Error('這次載入已放棄');
}

async function load(onProgress, attempt, watch, state) {
    const t0 = performance.now();
    const tracker = downloadTracker(fraction => {
        watch.kick();
        onProgress({ stage: 'download', fraction: fraction });
    });
    const download = startModelDownload(tracker.bytes('model'));
    state.aborts.push(download.abort);
    download.finished.then(tracker.done('model'), () => {});

    // 優先用 GPU（圖形處理器，手機與電腦的晶片都有內建）加速，不支援時改用 CPU
    const gpu = getGpuInfo();
    const useGpu = !FORCE_CPU && gpu && !gpu.software;
    const ctx = { onProgress, attempt, watch, state, t0, tracker, download, gpu, useGpu };

    // 優先在背景執行緒運算（主畫面不會被 AI 卡住）；背景執行緒不能用 GPU 時，改在主畫面用 GPU，速度比較快
    if (USE_WORKER && workerSupported()) {
        const worker = await watch.hold(startWorker());
        checkAbandoned(state);
        if (worker && (!useGpu || worker.webgl)) return loadInWorker(ctx, worker.worker);
        if (worker) {
            worker.worker.terminate();
            console.info('這個瀏覽器的背景執行緒不能用 GPU，改在主畫面執行');
        }
    }
    return loadOnMain(ctx);
}

// ---------- 在主畫面執行（不支援背景執行緒時） ----------

async function loadOnMain({ onProgress, attempt, watch, state, t0, tracker, download, gpu, useGpu }) {
    const { base, vision } = await watch.hold(importMediaPipe(attempt));
    checkAbandoned(state);
    const fileset = await vision.FilesetResolver.forVisionTasks(base + '/wasm');
    checkAbandoned(state);
    // AI 引擎的啟動程式也一樣：上次卡住的下載還沒結束時，瀏覽器會沿用那一個（一直等下去），所以重試時換一個網址
    if (attempt) fileset.wasmLoaderPath += '?retry=' + attempt;

    // AI 引擎由 MediaPipe 自己下載；在它下載時順便計算下載了多少（不會多下載一次）
    const engine = countEngineDownload(fileset.wasmBinaryPath, tracker.bytes('engine'));
    state.aborts.push(engine.abort);
    engine.finished.then(tracker.done('engine'));

    let downloadedAt = 0;
    let createdAt = 0;
    Promise.all([engine.finished, download.finished]).then(() => {
        watch.stop();  // 都下載完了，接下來是運算，花再久也不是網路卡住
        if (createdAt) return;  // 偵測器已經建好（進入暖機），不要再把畫面退回「啟動」階段
        downloadedAt = performance.now();
        onProgress({ stage: 'start', delegate: useGpu ? 'GPU' : 'CPU' });
    }, () => {});

    let created, computeMode, computeDetail;
    try {
        if (FORCE_CPU) {
            created = await createPoseLandmarker(vision, fileset, 'CPU', download.reader());
            [computeMode, computeDetail] = ['CPU', '測試模式'];
        } else if (!useGpu) {
            // 沒有實體 GPU（例如軟體模擬）時，直接用 CPU 反而比較快
            created = await createPoseLandmarker(vision, fileset, 'CPU', download.reader());
            [computeMode, computeDetail] = ['CPU', '未偵測到可用的 GPU'];
        } else {
            try {
                created = await createPoseLandmarker(vision, fileset, 'GPU', download.reader());
                [computeMode, computeDetail] = ['GPU', shortGpuName(gpu.name)];
            } catch (gpuErr) {
                console.warn('GPU 無法使用，改用 CPU：', gpuErr);
                created = await createPoseLandmarker(vision, fileset, 'CPU', await download.finished);
                [computeMode, computeDetail] = ['CPU', '此裝置無法使用 GPU'];
            }
        }
    } finally {
        engine.restore();
    }
    if (state.abandoned) {
        // 放棄之後才建好：關掉，不佔用記憶體與 GPU
        try {
            created.landmarker.close();
        } catch (err) {
            // 關不掉也沒關係
        }
        checkAbandoned(state);
    }
    createdAt = performance.now();

    onProgress({ stage: 'warmup' });
    await letScreenUpdate();
    const warmStart = performance.now();
    warmUp(created.landmarker);
    const end = performance.now();

    const seconds = ms => Math.round(ms / 100) / 10;
    const timings = {
        download: seconds((downloadedAt || createdAt) - t0),
        start: seconds(Math.max(0, createdAt - (downloadedAt || createdAt))),
        warmup: seconds(end - warmStart)
    };
    console.info('AI 載入各階段秒數：', timings);

    let lost = created.lost;
    const pose = {
        landmarker: created.landmarker, computeMode, computeDetail, gpuName: gpu ? gpu.name : '', timings,
        background: false,
        // 偵測一格：回傳 Promise { landmarks（33 點）, world（公尺座標） }，沒有人時兩者為 null
        // async：偵測出錯時變成 Promise 失敗，交給 main.js 的出錯計數（不會讓偵測迴圈停住）
        async detect(video, timeMs) {
            const r = pose.landmarker.detectForVideo(video, timeMs);
            return { landmarks: r.landmarks[0] || null, world: (r.worldLandmarks && r.worldLandmarks[0]) || null };
        },
        // 偵測器是否已經不能用（GPU 被系統收回）；能用時回傳空字串
        lostReason: () => (lost() ? 'GPU 被系統收回' : ''),
        // 偵測器壞掉時重新建立：原本用 GPU 就先再試一次 GPU（回到前景後通常就能用），還是不行再改用 CPU
        // 模型檔已經下載好留在記憶體裡，不用再下載，通常 1 秒內完成
        async restart() {
            try {
                pose.landmarker.close();
            } catch (err) {
                // 舊的偵測器可能已經壞了，關不掉也沒關係
            }
            const model = await download.finished;
            let next = null;
            if (pose.computeMode === 'GPU') {
                try {
                    next = await createPoseLandmarker(vision, fileset, 'GPU', model);
                } catch (err) {
                    console.warn('GPU 無法重新啟動，改用 CPU：', err);
                }
            }
            if (!next) {
                next = await createPoseLandmarker(vision, fileset, 'CPU', model);
                if (pose.computeMode === 'GPU') [pose.computeMode, pose.computeDetail] = ['CPU', 'GPU 失效，改用 CPU'];
            }
            warmUp(next.landmarker);
            pose.landmarker = next.landmarker;
            lost = next.lost;
        }
    };
    return pose;
}

// ---------- 在背景執行緒執行 ----------

// 需要：Worker、OffscreenCanvas（背景執行緒裡的畫布）、createImageBitmap（把鏡頭畫面複製一份送過去）
function workerSupported() {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
}

// 背景執行緒的檔案；網址帶上和這個檔案相同的版本號，發布新版時才不會拿到舊的
const WORKER_URL = new URL('./pose-worker.js' + new URL(import.meta.url).search, import.meta.url);
const HELLO_TIMEOUT_MS = 10000;
const RESTART_TIMEOUT_MS = 30000;  // 重新啟動最多等這麼久，超過就放棄（使用者可以關閉鏡頭重開再試）
const DETECT_TIMEOUT_MS = 5000;  // 一格超過這麼久沒有結果，當作背景執行緒卡住（正常最慢約 0.3 秒）

// 開一個背景執行緒，等它回報能不能用 GPU；回傳 { worker, webgl }，開不起來回傳 null
function startWorker() {
    return new Promise(resolve => {
        let worker;
        try {
            worker = new Worker(WORKER_URL);
        } catch (err) {
            console.warn('無法建立背景執行緒，改在主畫面執行：', err);
            resolve(null);
            return;
        }
        const timer = setTimeout(() => {
            worker.terminate();
            resolve(null);
        }, HELLO_TIMEOUT_MS);
        worker.onmessage = e => {
            if (e.data.type !== 'hello') return;
            clearTimeout(timer);
            resolve({ worker: worker, webgl: e.data.webgl });
        };
        worker.onerror = e => {
            clearTimeout(timer);
            console.warn('背景執行緒無法啟動，改在主畫面執行：', e.message);
            worker.terminate();
            resolve(null);
        };
    });
}

// 重試時換一個下載來源先試：上一個來源可能就是卡住的原因
function sourcesFor(attempt) {
    const n = MEDIAPIPE_URLS.length;
    return MEDIAPIPE_URLS.map((u, i) => MEDIAPIPE_URLS[(i + attempt) % n]);
}

// 在背景執行緒建立偵測器並暖機
// model：完整模型檔（重新啟動時）；沒有時就用 download 邊下載邊送
// 回傳 Promise { delegate, gpuError, warmupMs, createdAt }；onEngine(received) / onEngineDone() 回報 AI 引擎下載進度
function initWorker(worker, { attempt, delegate, download, model, onEngine, onEngineDone, onCreated }) {
    return new Promise((resolve, reject) => {
        let created = null;
        worker.onmessage = e => {
            const m = e.data;
            if (m.type === 'bytes') onEngine && onEngine(m.received);
            else if (m.type === 'engine-done') onEngineDone && onEngineDone();
            else if (m.type === 'created') {
                created = { delegate: m.delegate, gpuError: m.gpuError, createdAt: performance.now() };
                if (onCreated) onCreated();
            } else if (m.type === 'ready') resolve({ ...created, warmupMs: m.warmupMs });
            else if (m.type === 'fatal') reject(new Error(m.message));
        };
        worker.onerror = e => {
            e.preventDefault();
            reject(new Error('背景執行緒出錯：' + e.message));
        };
        if (model) {
            const copy = model.slice();
            worker.postMessage({ type: 'init', bases: sourcesFor(attempt), attempt, delegate, model: copy.buffer }, [copy.buffer]);
        } else {
            worker.postMessage({ type: 'init', bases: sourcesFor(attempt), attempt, delegate });
            // 模型邊下載邊送過去（複製一份，原本的留著給改用 CPU、重新啟動時用）
            download.subscribe({
                chunk: v => {
                    const copy = v.slice();
                    worker.postMessage({ type: 'model-chunk', chunk: copy.buffer }, [copy.buffer]);
                },
                done: () => worker.postMessage({ type: 'model-done' }),
                error: err => worker.postMessage({ type: 'model-error', message: String(err && err.message || err) })
            });
        }
    });
}

async function loadInWorker({ onProgress, attempt, watch, state, t0, tracker, download, gpu, useGpu }, worker) {
    // 下載卡住時直接結束整個背景執行緒：裡面所有的下載、運算一起停掉，不會在背景繼續搶網路
    state.aborts.push(() => worker.terminate());
    const delegate = useGpu ? 'GPU' : 'CPU';
    let engineDone, downloadedAt = 0;
    const engineFinished = new Promise(resolve => { engineDone = resolve; });
    engineFinished.then(tracker.done('engine'));
    Promise.all([engineFinished, download.finished]).then(() => {
        watch.stop();  // 都下載完了，接下來是運算，花再久也不是網路卡住
        downloadedAt = performance.now();
        onProgress({ stage: 'start', delegate: delegate });
    }, () => {});

    let info;
    try {
        info = await initWorker(worker, {
            attempt, delegate, download,
            onEngine: tracker.bytes('engine'),
            onEngineDone: engineDone,
            onCreated: () => {
                watch.stop();
                onProgress({ stage: 'warmup' });
            }
        });
        checkAbandoned(state);
    } catch (err) {
        // 失敗了（例如 MediaPipe 下載不下來）：結束這個背景執行緒，重試時會開新的，不會越積越多
        worker.terminate();
        throw err;
    }

    let computeMode = info.delegate, computeDetail;
    if (FORCE_CPU) computeDetail = '測試模式';
    else if (!useGpu) computeDetail = '未偵測到可用的 GPU';
    else if (info.delegate === 'GPU') computeDetail = shortGpuName(gpu.name);
    else {
        console.warn('GPU 無法使用，改用 CPU：', info.gpuError);
        computeDetail = '此裝置無法使用 GPU';
    }
    const seconds = ms => Math.round(ms / 100) / 10;
    const timings = {
        download: seconds((downloadedAt || info.createdAt) - t0),
        start: seconds(Math.max(0, info.createdAt - (downloadedAt || info.createdAt))),
        warmup: seconds(info.warmupMs)
    };
    console.info('AI 載入各階段秒數（背景執行緒）：', timings);
    return workerPose(worker, { computeMode, computeDetail, gpu, timings, download, attempt });
}

// 背景執行緒的偵測器：介面和主畫面的相同（detect、lostReason、restart）
function workerPose(firstWorker, { computeMode, computeDetail, gpu, timings, download, attempt }) {
    let worker = firstWorker;
    let pending = null;   // 送出去、還沒回來的那一格 { resolve, reject }
    let lost = false;     // GPU 被系統收回
    let dead = '';        // 背景執行緒停掉的原因
    let nextId = 0;

    function attach(w) {
        worker = w;
        lost = false;
        dead = '';
        w.onmessage = e => {
            const m = e.data;
            if (m.type !== 'result' && m.type !== 'detect-error') return;
            if (m.lost) lost = true;
            const p = pending;
            pending = null;
            if (!p || p.id !== m.id) return;
            if (m.type === 'result') p.resolve({ landmarks: m.landmarks, world: m.world });
            else p.reject(new Error(m.message));
        };
        w.onerror = e => {
            e.preventDefault();
            dead = '背景運算停止（' + (e.message || '未知原因') + '）';
            fail(new Error(dead));
        };
    }
    function fail(err) {
        const p = pending;
        pending = null;
        if (p) p.reject(err);
    }
    attach(worker);

    // 背景執行緒卡住（一直沒回傳）：當作停掉了，交給 main.js 重新啟動，畫面才不會永遠停住
    // 頁面在背景時不算：手機關螢幕、切到別的 App 時，背景執行緒會被暫停，回來時不代表壞掉；
    // 回到前景後重新給完整的等待時間，不會一回來就把正常的背景執行緒砍掉重建（畫面停 1～2 秒）
    let visibleSince = performance.now();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) visibleSince = performance.now();
    });
    function watchDetect(id, sentAt) {
        const check = () => {
            if (!pending || pending.id !== id) return;
            const waited = performance.now() - Math.max(sentAt, visibleSince);
            if (document.hidden || waited < DETECT_TIMEOUT_MS) {
                setTimeout(check, document.hidden ? 1000 : DETECT_TIMEOUT_MS - waited);
                return;
            }
            dead = '背景運算沒有回應';
            fail(new Error(dead));
        };
        setTimeout(check, DETECT_TIMEOUT_MS);
    }

    const pose = {
        computeMode, computeDetail: computeDetail + '（背景運算）', gpuName: gpu ? gpu.name : '', timings,
        background: true,
        // 偵測一格：複製一份鏡頭畫面送到背景執行緒；同時只會有一格在處理
        async detect(video, timeMs) {
            if (pending) throw new Error('上一格還在處理');
            const bitmap = await createImageBitmap(video);
            return new Promise((resolve, reject) => {
                const id = ++nextId;
                pending = { id, resolve, reject };
                watchDetect(id, performance.now());
                try {
                    worker.postMessage({ type: 'detect', id, bitmap, ts: timeMs }, [bitmap]);
                } catch (err) {
                    pending = null;
                    bitmap.close();
                    reject(err);
                }
            });
        },
        lostReason: () => (dead || (lost ? 'GPU 被系統收回' : '')),
        // 重新啟動：直接換一個新的背景執行緒（舊的連同 GPU 資源一起清掉），模型檔已經在記憶體裡，不用再下載
        // 原本用 GPU 就先再試一次 GPU（回到前景後通常就能用），還是不行再改用 CPU
        async restart() {
            worker.terminate();
            fail(new Error('重新啟動中'));
            const model = await download.finished;
            const fresh = await startWorker();
            if (!fresh) throw new Error('無法重新建立背景執行緒');
            let info, timer;
            try {
                // 新的背景執行緒要重新載入 MediaPipe（通常瀏覽器已經存著，很快）；網路剛好卡住時不要永遠停在「重新啟動中」
                const timeout = new Promise((resolve, reject) => {
                    timer = setTimeout(() => reject(new Error('重新啟動超過 ' + RESTART_TIMEOUT_MS / 1000 + ' 秒')), RESTART_TIMEOUT_MS);
                });
                const init = initWorker(fresh.worker, { attempt, delegate: pose.computeMode === 'GPU' && fresh.webgl ? 'GPU' : 'CPU', model });
                info = await Promise.race([init, timeout]);
            } catch (err) {
                fresh.worker.terminate();
                throw err;
            } finally {
                clearTimeout(timer);
            }
            if (pose.computeMode === 'GPU' && info.delegate !== 'GPU') {
                [pose.computeMode, pose.computeDetail] = ['CPU', 'GPU 失效，改用 CPU（背景運算）'];
            }
            attach(fresh.worker);
        }
    };
    return pose;
}
