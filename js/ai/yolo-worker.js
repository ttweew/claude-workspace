// YOLO 的背景執行緒（11/21）：用 LiteRT.js 跑 YOLO26 姿勢模型，主畫面不會被 AI 卡住（和 MediaPipe 的 pose-worker.js 一樣的道理）
// 這是一般的 Worker（不是 module）：LiteRT.js 在背景執行緒裡用 importScripts 載入 AI 引擎，module worker 不能用 importScripts；
// 網站自己的程式（yolo-core.js）和放在網站裡的 LiteRT.js（vendor/litertjs/）用 import() 載入
//
// 和主畫面溝通的訊息（type）：
//   收到：init（AI 引擎和模型檔，主畫面下載好了才送來，下載進度由主畫面顯示）、detect（一格畫面；focus：使用者點的位置，11/22）
//   送出：ready（準備好了：用 GPU 還是 CPU、兩種各量到每格幾毫秒）、fatal（無法啟動）、
//         result（找到的 17 個點；沒有人是 null；focus：點的那裡有沒有人 'ok'、沒有 'miss'、就是正在跟著的人 'same'）、detect-error
//
// 「先框出人」（js/ai/yolo-core.js 的 regionFor）：上一格找到人，這一格只看人附近（放大 25%），人在 320 裡變大、點比較準；
// 找不到人就下一格看整個畫面
// 畫面裡有好幾個人（11/22，yolo-core.js 的 pickPerson）：跟著同一個人（和上一格的框重疊最多的），不跳到旁邊分數比較高的人身上；
// 跟丟了（被擋住、走出去）LOST_MS 內在原本位置附近大一點的範圍找回同一個人，超過就看整個畫面、改跟最大的（離手機最近的）；
// 使用者點了畫面就改跟點的那個人

let core = null;    // LiteRT.js：{ loadLiteRt, loadAndCompile, Tensor }
let yc = null;      // js/ai/yolo-core.js
let model = null;   // 編譯好的模型
let box = null;     // 跟著的人在上一次找到時的框（畫面像素 [x1, y1, x2, y2]），還沒有人是 null
let lostAt = null;  // 跟著的人從什麼時候開始找不到（ts）；找得到是 null
let last = null;    // 上一格的 { ts, W, H }：隔太久、畫面大小變了（換了照片、換了鏡頭）就不沿用上一格的框
const GAP_MS = 500; // 鏡頭每秒 30 格時兩格差約 33 毫秒；超過 0.5 秒（照片量角器一張一張算、切到背景回來）當作新的畫面
// 跟丟多久就放掉、改跟最大的那個人：1 秒（擋住一下、蹲下去被桌子擋到都在 1 秒內；網站「看不到人」1.5 秒才作廢這一下，
// reps.js 的 lostMs），比這個久大概是真的走出畫面了
const LOST_MS = 1000;
// 點的那個人和正在跟著的人的框重疊這麼多，就是同一個人（點在自己身上，例如肚子，不是關節）：不用從頭開始
const SAME_FOCUS_IOU = 0.5;
let canvas = null, ctx = null, input = null;
let kpts = 17;      // 模型有幾個點：官方的 17；自己訓練、加腳跟腳尖的 21（js/ai/models.js 的 kpts）

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
            if (!out || out.length < yc.colsOf(kpts) || !Number.isFinite(out[4])) throw new Error(accelerator + ' 算出來的數字不對');
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

// m：{ base（AI 引擎的下載來源）, engineJs（引擎的啟動程式檔名）, engine（引擎 ArrayBuffer）, model（模型檔 ArrayBuffer）, cpuOnly, kpts }
async function init(m) {
    kpts = m.kpts === 21 ? 21 : 17;
    const search = self.location.search;   // 網站更新時的版本號（?v=…），一起帶給 import 的檔案
    yc = await import('./yolo-core.js' + search);
    core = await import('../../vendor/litertjs/litert-core.js' + search);
    // AI 引擎：主畫面已經下載好（才看得到下載進度），直接交給它，不用再下載一次；
    // 萬一引擎啟動失敗，LiteRT.js 會一直等，所以自己回報錯誤（主畫面另外有時限）
    // 引擎、模型的位元組用完就放掉（m 裡的也清掉）：self.Module 一直留著，裡面的 locateFile 用到 m，
    // 不清掉的話引擎和模型檔（YOLO26n 合起來約 23 MB）會一直佔著背景執行緒的記憶體
    let engine = m.engine;
    const modelBytes = m.model;
    m.engine = m.model = null;
    self.Module = {
        locateFile: path => m.base + path,
        instantiateWasm(imports, done) {
            const bytes = engine;
            engine = null;
            WebAssembly.instantiate(bytes, imports).then(r => done(r.instance), err => fatal(new Error('AI 引擎無法啟動：' + err.message)));
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
            const r = await tryAccelerator(modelBytes, 'webgpu');
            tried.GPU = Math.round(r.ms);
            best = { ...r, mode: 'GPU' };
        } catch (err) {
            gpuError = String(err && err.message || err);
        }
    }
    const cpu = await tryAccelerator(modelBytes, 'wasm');
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

// 給模型看畫面的一塊（region，畫面像素）→ 找到的每一個人（yolo-core.js 的 decodeAll）
async function peopleIn(bitmap, region, W, H) {
    const S = yc.INPUT_SIZE;
    const fit = yc.letterbox(region.rw, region.rh, S);
    ctx.fillStyle = 'rgb(114, 114, 114)';
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(bitmap, region.rx, region.ry, region.rw, region.rh, fit.padX, fit.padY, fit.w, fit.h);
    yc.toInput(ctx.getImageData(0, 0, S, S).data, S, input);
    return yc.decodeAll(await runOnce(model), region, fit, W, H, S, kpts);
}

// 使用者點的位置（主畫面送來的，鏡頭原始畫面的比例座標 0～1）→ 畫面像素；不是兩個 0～1 的數字就當作沒點
function focusOf(f, W, H) {
    if (!f || typeof f !== 'object') return null;
    const { x, y } = f;
    return typeof x === 'number' && typeof y === 'number' && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [x * W, y * H] : null;
}

// 一格：m：{ id, bitmap, ts（送出這一格的時間，毫秒）, focus（使用者點的位置 { x, y }，可省略） }
async function detect(m) {
    const bitmap = m.bitmap;
    try {
        if (!model) throw new Error('模型還沒準備好');
        const t0 = performance.now();
        const W = bitmap.width, H = bitmap.height;
        const ts = typeof m.ts === 'number' && Number.isFinite(m.ts) ? m.ts : null;
        if (!last || ts === null || ts - last.ts > GAP_MS || ts < last.ts || W !== last.W || H !== last.H) box = lostAt = null;
        last = ts === null ? null : { ts, W, H };
        const focus = focusOf(m.focus, W, H);
        // 先框出人：跟著的人上一格找得到就只看他附近；跟丟了 LOST_MS 以內看原本位置附近大一點的範圍（遠的、小的人在整個畫面裡找不到）；
        // 還沒有人、跟丟太久、使用者點了畫面（要找點的那個人）就看整個畫面
        const lostLong = lostAt !== null && !(ts - lostAt <= LOST_MS);
        const region = (!focus && !lostLong && yc.regionFor(box, W, H, lostAt === null ? yc.ROI_GROW : yc.LOST_GROW)) || { rx: 0, ry: 0, rw: W, rh: H };
        const people = await peopleIn(bitmap, region, W, H);
        let chosen = focus ? yc.pickPerson(people, { focus }) : null;
        // 點的人在整個畫面裡太小找不到（遠的、趴著的）：把點的那一塊放大再找一次（只有點了、第一次又沒找到的那一格多算一次）
        if (focus && !chosen) {
            const zoom = yc.regionAround(focus, W, H);
            if (zoom) chosen = yc.pickPerson(await peopleIn(bitmap, zoom, W, H), { focus });
        }
        const focused = !focus ? undefined : !chosen ? 'miss'
            : box && lostAt === null && yc.iou(chosen.box, box) >= SAME_FOCUS_IOU ? 'same' : 'ok';
        // 沒點、或點的地方沒有人：照常跟著原本的人；跟丟太久（或還沒有人）就改跟最大的
        if (!chosen) chosen = box && !lostLong ? yc.pickPerson(people, { prev: box }) : yc.pickPerson(people);
        if (chosen) {
            box = chosen.box;
            lostAt = null;
        } else if (box && lostAt === null) {
            lostAt = ts === null ? -Infinity : ts;
        }
        self.postMessage({ type: 'result', id: m.id, k: chosen ? chosen.k : null, focus: focused, ms: performance.now() - t0 });
    } catch (err) {
        box = lostAt = null;
        self.postMessage({ type: 'detect-error', id: m.id, message: String(err && err.message || err) });
    } finally {
        bitmap.close();
    }
}
