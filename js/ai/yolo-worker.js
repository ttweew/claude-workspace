// YOLO 的背景執行緒（11/21）：用 LiteRT.js 跑 YOLO26 姿勢模型，主畫面不會被 AI 卡住（和 MediaPipe 的 pose-worker.js 一樣的道理）
// 這是一般的 Worker（不是 module）：LiteRT.js 在背景執行緒裡用 importScripts 載入 AI 引擎，module worker 不能用 importScripts；
// 網站自己的程式（yolo-core.js）和放在網站裡的 LiteRT.js（vendor/litertjs/）用 import() 載入
//
// 和主畫面溝通的訊息（type）：
//   收到：init（AI 引擎和模型檔，主畫面下載好了才送來，下載進度由主畫面顯示）、detect（一格畫面）
//   送出：ready（準備好了：用 GPU 還是 CPU、兩種各量到每格幾毫秒）、fatal（無法啟動）、
//         result（找到的 17 個點；沒有人是 null）、detect-error
//
// 「先框出人」（js/ai/yolo-core.js 的 regionFor）：上一格找到人，這一格只看人附近（放大 25%），人在 320 裡變大、點比較準；
// 找不到人就下一格看整個畫面

let core = null;    // LiteRT.js：{ loadLiteRt, loadAndCompile, Tensor }
let yc = null;      // js/ai/yolo-core.js
let model = null;   // 編譯好的模型
let box = null;     // 上一格找到的人（畫面像素 [x1, y1, x2, y2]），找不到是 null
let last = null;    // 上一格的 { ts, W, H }：隔太久、畫面大小變了（換了照片、換了鏡頭）就不沿用上一格的框
const GAP_MS = 500; // 鏡頭每秒 30 格時兩格差約 33 毫秒；超過 0.5 秒（照片量角器一張一張算、切到背景回來）當作新的畫面
let canvas = null, ctx = null, input = null;

self.onmessage = event => {
    const m = event.data;
    if (m.type === 'init') init(m).catch(err => fatal(err));
    else if (m.type === 'detect') detect(m);
};

function fatal(err) {
    self.postMessage({ type: 'fatal', message: String(err && err.message || err) });
}

// 跑幾次量速度：第一次特別慢（準備記憶體、GPU 編譯），不算；取後面幾次的中位數
const TRIES = 4;
function median(list) {
    const s = [...list].sort((a, b) => a - b);
    return s[s.length >> 1];
}

// 跑一次模型：input（Float32Array）→ 輸出（Float32Array，[300, 57]）
async function runOnce(compiled) {
    const tensor = new core.Tensor(input, [1, 3, yc.INPUT_SIZE, yc.INPUT_SIZE]);
    let outputs;
    try {
        outputs = await compiled.run(tensor);
        // GPU 算的結果在 GPU 上，data() 會搬回來；CPU 的直接讀
        return await outputs[0].data();
    } finally {
        tensor.delete();
        if (outputs) for (const t of outputs) t.delete();
    }
}

// 編譯一種運算方式，跑幾次量每格幾毫秒；回傳 { compiled, ms }，不能用時丟出錯誤
async function tryAccelerator(bytes, accelerator) {
    const compiled = await core.loadAndCompile(new Uint8Array(bytes), { accelerator });
    try {
        const times = [];
        for (let i = 0; i < TRIES; i++) {
            const t0 = performance.now();
            const out = await runOnce(compiled);
            times.push(performance.now() - t0);
            // 算出來的數字壞掉（GPU 驅動有問題時會整片 NaN）：這種運算方式不能用
            if (!out || out.length < yc.COLS || !Number.isFinite(out[4])) throw new Error(accelerator + ' 算出來的數字不對');
        }
        return { compiled, ms: median(times.slice(1)) };
    } catch (err) {
        compiled.delete();
        throw err;
    }
}

// 這台裝置有沒有真的 GPU：沒有（軟體模擬的，isFallbackAdapter）就不試，比 CPU 慢很多
async function realGpu() {
    if (!self.navigator.gpu) return null;
    try {
        const adapter = await self.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) return null;
        const info = adapter.info || {};
        if (info.isFallbackAdapter || adapter.isFallbackAdapter) return null;
        return { name: [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' ') };
    } catch (err) {
        return null;
    }
}

// m：{ base（AI 引擎的下載來源）, engineJs（引擎的啟動程式檔名）, engine（引擎 ArrayBuffer）, model（模型檔 ArrayBuffer）, cpuOnly }
async function init(m) {
    const search = self.location.search;   // 網站更新時的版本號（?v=…），一起帶給 import 的檔案
    yc = await import('./yolo-core.js' + search);
    core = await import('../../vendor/litertjs/litert-core.js' + search);
    // AI 引擎：主畫面已經下載好（才看得到下載進度），直接交給它，不用再下載一次；
    // 萬一引擎啟動失敗，LiteRT.js 會一直等，所以自己回報錯誤（主畫面另外有時限）
    self.Module = {
        locateFile: path => m.base + path,
        instantiateWasm(imports, done) {
            WebAssembly.instantiate(m.engine, imports).then(r => done(r.instance), err => fatal(new Error('AI 引擎無法啟動：' + err.message)));
            return {};
        }
    };
    await core.loadLiteRt(m.base + m.engineJs);
    const S = yc.INPUT_SIZE;
    canvas = new OffscreenCanvas(S, S);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    input = new Float32Array(3 * S * S);   // 量速度時用全灰的畫面（和沒有人一樣）
    input.fill(114 / 255);

    // 選運算方式：有真的 GPU 時 WebGPU、CPU（WebAssembly）兩種都量，用快的那個（11/21：沒有手機的實測數字，
    // 有的手機 GPU 反而比 CPU 慢，量了才知道）；GPU 不能用、算錯就用 CPU
    const gpu = m.cpuOnly ? null : await realGpu();
    const tried = {};
    let best = null, gpuError = '';
    if (gpu) {
        try {
            const r = await tryAccelerator(m.model, 'webgpu');
            tried.GPU = Math.round(r.ms);
            best = { ...r, mode: 'GPU' };
        } catch (err) {
            gpuError = String(err && err.message || err);
        }
    }
    const cpu = await tryAccelerator(m.model, 'wasm');
    tried.CPU = Math.round(cpu.ms);
    if (!best || cpu.ms <= best.ms) {
        if (best) best.compiled.delete();
        best = { ...cpu, mode: 'CPU' };
    } else {
        cpu.compiled.delete();
    }
    model = best.compiled;
    self.postMessage({ type: 'ready', mode: best.mode, gpuName: gpu ? gpu.name : '', gpuError, tried });
}

// 一格：m：{ id, bitmap, ts（送出這一格的時間，毫秒） }
async function detect(m) {
    const bitmap = m.bitmap;
    try {
        if (!model) throw new Error('模型還沒準備好');
        const t0 = performance.now();
        const W = bitmap.width, H = bitmap.height;
        const S = yc.INPUT_SIZE;
        const ts = typeof m.ts === 'number' && Number.isFinite(m.ts) ? m.ts : null;
        if (!last || ts === null || ts - last.ts > GAP_MS || ts < last.ts || W !== last.W || H !== last.H) box = null;
        last = ts === null ? null : { ts, W, H };
        // 先框出人：上一格有人就只看人附近；沒有就看整個畫面
        const region = yc.regionFor(box, W, H) || { rx: 0, ry: 0, rw: W, rh: H };
        const fit = yc.letterbox(region.rw, region.rh, S);
        ctx.fillStyle = 'rgb(114, 114, 114)';
        ctx.fillRect(0, 0, S, S);
        ctx.drawImage(bitmap, region.rx, region.ry, region.rw, region.rh, fit.padX, fit.padY, fit.w, fit.h);
        yc.toInput(ctx.getImageData(0, 0, S, S).data, S, input);
        const out = await runOnce(model);
        const best = yc.decodeBest(out, region, fit, W, H, S);
        box = best ? best.box : null;
        self.postMessage({ type: 'result', id: m.id, k: best ? best.k : null, ms: performance.now() - t0 });
    } catch (err) {
        box = null;
        self.postMessage({ type: 'detect-error', id: m.id, message: String(err && err.message || err) });
    } finally {
        bitmap.close();
    }
}
