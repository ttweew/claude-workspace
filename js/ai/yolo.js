// YOLO 偵測器（11/21，實驗）：下載 LiteRT.js 的 AI 引擎和 YOLO26 模型檔、在背景執行緒（js/ai/yolo-worker.js）跑
// 介面和 MediaPipe 的偵測器一樣（js/ai/pose-source.js 開頭寫的那些），網站其他部分不用知道是哪一家的模型
// 找到的 17 個點換成網站用的 33 點（js/ai/keypoints.js）：沒有腳跟、腳尖、手指（visibility 0），沒有 3D 座標（world 是 null）
//
// 下載在主畫面做（才看得到進度、卡住能放棄重試），下載好再交給背景執行緒；兩個檔案都留著，重新啟動、換大小時不用再下載
// 下載卡住、背景執行緒沒回應的處理和 MediaPipe 那邊（js/ai/pose.js）一樣的想法，數字也一樣

import { LITERT_URLS, LITERT_ENGINE_SIZE, YOLO_FILES, FORCE_CPU } from '../config.js';
import { cocoToLandmarks } from './keypoints.js';
import { profileOf } from './models.js';

const STALL_MS = 15000;            // 下載中超過 15 秒完全沒收到資料 → 放棄這次，交給 main.js 重試（和 pose.js 一樣）
const CONNECT_TIMEOUT_MS = 20000;  // 一個下載來源 20 秒還沒開始給資料 → 改用下一個來源
const INIT_TIMEOUT_MS = 90000;     // 背景執行緒啟動（載入引擎、編譯、兩種運算方式各量一次）最多等這麼久；11/21 這台電腦約 3 秒
const DETECT_TIMEOUT_MS = 5000;    // 一格超過這麼久沒有結果，當作背景執行緒卡住（s 模型在慢的 CPU 上約 0.2 秒）
const WORKER_URL = new URL('./yolo-worker.js' + new URL(import.meta.url).search, import.meta.url);

// 瀏覽器支不支援 WebAssembly 的「relaxed SIMD」（比較新的運算指令）：支援的用比較快的引擎，不支援的用相容版
// 這幾個位元組是 LiteRT.js 自己用來檢查的同一個小程式（@litertjs/core 2.6.0 的 WASM_RELAXED_SIMD_CHECK）
const RELAXED_SIMD_CHECK = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11]);
function engineName() {
    let relaxed = false;
    try {
        relaxed = WebAssembly.validate(RELAXED_SIMD_CHECK);
    } catch (err) {
        relaxed = false;
    }
    return relaxed ? 'litert_wasm_internal' : 'litert_wasm_compat_internal';
}

// 這個模型有幾個點（js/ai/models.js 的 kpts；沒寫的是官方的 17 點）
const kptsOf = key => (profileOf(key) && profileOf(key).kpts === 21 ? 21 : 17);

// 這個瀏覽器能不能跑 YOLO：要有背景執行緒、背景執行緒裡的畫布、從影片抓一格畫面、WebAssembly
export function yoloSupported() {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
        && typeof createImageBitmap !== 'undefined' && typeof WebAssembly !== 'undefined';
}

// 下載卡住偵測：每收到資料就 kick()；超過 STALL_MS 沒有 kick 就 onStall()；網頁在背景時（手機可能暫停網路）不算
function stallWatch(onStall) {
    let last = performance.now();
    const kick = () => { last = performance.now(); };
    const timer = setInterval(() => {
        if (document.hidden) kick();
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
    return { kick, stop };
}

// 下載一個檔案，邊下載邊回報收到幾個位元組；回傳 Uint8Array
async function fetchBytes(url, onBytes, signal) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('下載失敗（HTTP ' + res.status + '）：' + url);
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onBytes(received);
    }
    const data = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
        data.set(c, offset);
        offset += c.length;
    }
    return data;
}

// AI 引擎：依序試每個下載來源（重試時換一個先試，上一個可能就是卡住的原因）；回傳 { base, engineJs, engine }
async function fetchEngine(attempt, onBytes, signal) {
    const name = engineName();
    const n = LITERT_URLS.length;
    let lastErr;
    for (let i = 0; i < n; i++) {
        const base = LITERT_URLS[(i + attempt) % n];
        // 這個來源一直沒回應：CONNECT_TIMEOUT_MS 後換下一個（開始給資料之後交給卡住偵測）
        const aborter = new AbortController();
        const stop = () => aborter.abort();
        signal.addEventListener('abort', stop, { once: true });
        let started = false;
        const timer = setTimeout(() => { if (!started) aborter.abort(); }, CONNECT_TIMEOUT_MS);
        try {
            const engine = await fetchBytes(base + name + '.wasm' + (attempt ? '?retry=' + attempt : ''), received => {
                started = true;
                onBytes(received);
            }, aborter.signal);
            return { base, engineJs: name + '.js', engine };
        } catch (err) {
            if (signal.aborted) throw err;
            lastErr = err;
            console.warn('YOLO 的 AI 引擎下載失敗，改用下一個來源：', base, err);
            onBytes(0);
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', stop);
        }
    }
    throw lastErr;
}

// 兩個檔案的下載量合併成一個整體進度（0～1）；下載完之前最多算到 99%
function progressOf(sizes, received) {
    let sum = 0, total = 0;
    for (const k of Object.keys(sizes)) {
        sum += Math.min(received[k], sizes[k] * 0.99);
        total += sizes[k];
    }
    return sum / total;
}

// 啟動一個背景執行緒、交給它引擎和模型、等它量完速度；回傳 { worker, info }
function startWorker(files, cpuOnly, kpts = 17) {
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(WORKER_URL);
        } catch (err) {
            reject(err);
            return;
        }
        const timer = setTimeout(() => {
            worker.terminate();
            reject(new Error('YOLO 啟動超過 ' + INIT_TIMEOUT_MS / 1000 + ' 秒'));
        }, INIT_TIMEOUT_MS);
        worker.onmessage = e => {
            const m = e.data;
            if (m.type === 'ready') {
                clearTimeout(timer);
                resolve({ worker, info: m });
            } else if (m.type === 'fatal') {
                clearTimeout(timer);
                worker.terminate();
                reject(new Error(m.message));
            }
        };
        worker.onerror = e => {
            e.preventDefault();
            clearTimeout(timer);
            worker.terminate();
            reject(new Error('YOLO 的背景執行緒出錯：' + (e.message || '未知原因')));
        };
        // 複製一份送過去（送過去的會被搬走），原本的留著重新啟動、換大小時用
        const engine = files.engine.slice().buffer, model = files.model.slice().buffer;
        worker.postMessage({ type: 'init', base: files.base, engineJs: files.engineJs, engine, model, cpuOnly, kpts }, [engine, model]);
    });
}

// 運算方式的說明（運算標籤點開時顯示）：兩種都量過的寫出各幾毫秒，使用者知道為什麼選這個
function describe(info) {
    const t = info.tried || {};
    const both = t.GPU !== undefined && t.CPU !== undefined ? '（量過：GPU 每格 ' + t.GPU + ' 毫秒、CPU ' + t.CPU + ' 毫秒）' : '';
    if (info.mode === 'GPU') return 'WebGPU' + both;
    if (FORCE_CPU) return '測試模式';
    if (info.gpuError) return 'GPU 無法使用';
    if (t.GPU !== undefined) return 'CPU 比較快' + both;
    return '未偵測到可用的 GPU';
}

// 下載模型檔（換大小時）：onFraction(0～1)；卡住就放棄（原本的模型照常可用）
async function downloadModel(key, onFraction) {
    const aborter = new AbortController();
    let stalled;
    const stall = new Promise((resolve, reject) => { stalled = reject; });
    const watch = stallWatch(() => {
        aborter.abort();
        stalled(new Error('下載停住了：超過 ' + STALL_MS / 1000 + ' 秒沒有收到任何資料'));
    });
    try {
        return await Promise.race([fetchBytes(new URL(YOLO_FILES[key].path, document.baseURI).href, received => {
            watch.kick();
            onFraction(Math.min(received / YOLO_FILES[key].size, 0.99));
        }, aborter.signal), stall]);
    } finally {
        watch.stop();
    }
}

// 載入 YOLO（js/ai/pose-source.js 呼叫；參數和 MediaPipe 的 loadPoseModel 一樣）
// key：'yolo-n' 或 'yolo-s'
export async function loadYolo(onProgress, attempt = 0, key = 'yolo-n') {
    if (!Object.prototype.hasOwnProperty.call(YOLO_FILES, key)) throw new Error('不認得的 YOLO 模型：' + key);
    if (!yoloSupported()) {
        const err = new Error('這個瀏覽器不能執行 YOLO（缺少背景執行緒或背景畫布）');
        err.unsupported = true;
        err.advice = '這個瀏覽器不能執行 YOLO（缺少背景執行緒或背景畫布），請到「進階設定」把 AI 模型改回 MediaPipe（lite）';
        throw err;
    }
    const t0 = performance.now();
    const aborter = new AbortController();
    let stalled;
    const stall = new Promise((resolve, reject) => { stalled = reject; });
    const watch = stallWatch(() => {
        aborter.abort();
        stalled(new Error('下載停住了：超過 ' + STALL_MS / 1000 + ' 秒沒有收到任何資料'));
    });
    let abandoned = false;
    const sizes = { engine: LITERT_ENGINE_SIZE, model: YOLO_FILES[key].size };
    const received = { engine: 0, model: 0 };
    const bytes = name => n => {
        received[name] = n;
        watch.kick();
        if (!abandoned) onProgress({ stage: 'download', fraction: progressOf(sizes, received) });
    };
    let files;
    try {
        const modelUrl = new URL(YOLO_FILES[key].path, document.baseURI).href + (attempt ? '?retry=' + attempt : '');
        const [engine, model] = await Promise.race([
            Promise.all([fetchEngine(attempt, bytes('engine'), aborter.signal), fetchBytes(modelUrl, bytes('model'), aborter.signal)]),
            stall
        ]);
        files = { ...engine, model };
    } catch (err) {
        abandoned = true;
        aborter.abort();
        throw err;
    } finally {
        watch.stop();
    }
    const downloadedAt = performance.now();
    onProgress({ stage: 'start', delegate: 'CPU' });
    const { worker, info } = await startWorker(files, FORCE_CPU, kptsOf(key));
    const readyAt = performance.now();
    console.info('YOLO 載入：', key, info.mode, info.tried);
    const seconds = ms => Math.round(ms / 100) / 10;
    return yoloPose(worker, info, files, key, {
        download: seconds(downloadedAt - t0),
        start: seconds(readyAt - downloadedAt),
        warmup: 0
    });
}

// 背景執行緒的偵測器（介面和 MediaPipe 的一樣）
function yoloPose(firstWorker, firstInfo, files, firstKey, timings) {
    let worker = firstWorker;
    let pending = null;   // 送出去、還沒回來的那一格 { id, resolve, reject, timer }
    let dead = '';        // 背景執行緒停掉的原因
    let nextId = 0;
    let focus = null;     // 使用者點的位置（11/22，focusAt）：跟著下一格送出去，送了就清掉

    function attach(w) {
        worker = w;
        dead = '';
        w.onmessage = e => {
            const m = e.data;
            if (m.type !== 'result' && m.type !== 'detect-error') return;
            const p = pending;
            pending = null;
            if (p) clearTimeout(p.timer);
            if (!p || p.id !== m.id) return;
            // focus（11/22）：這一格帶了使用者點的位置時，點的地方有沒有人（'ok' 改跟他、'miss' 沒有人、'same' 就是正在跟著的人），main.js 寫出來
            if (m.type === 'result') p.resolve({ landmarks: m.k ? cocoToLandmarks(m.k) : null, world: null, focus: ['ok', 'miss', 'same'].includes(m.focus) ? m.focus : undefined });
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
        if (p) {
            clearTimeout(p.timer);
            p.reject(err);
        }
    }
    attach(worker);

    // 背景執行緒卡住（一直沒回傳）：當作停掉了，交給 main.js 重新啟動；頁面在背景時不算（和 pose.js 一樣）
    let visibleSince = performance.now();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) visibleSince = performance.now();
    });
    function watchDetect(id, sentAt) {
        const check = () => {
            if (!pending || pending.id !== id) return;
            const waited = performance.now() - Math.max(sentAt, visibleSince);
            if (document.hidden || waited < DETECT_TIMEOUT_MS) {
                pending.timer = setTimeout(check, document.hidden ? 1000 : DETECT_TIMEOUT_MS - waited);
                return;
            }
            dead = '背景運算沒有回應';
            fail(new Error(dead));
        };
        pending.timer = setTimeout(check, DETECT_TIMEOUT_MS);
    }

    function setInfo(info) {
        pose.computeMode = info.mode;
        pose.computeDetail = describe(info) + '（背景運算）';
        pose.gpuName = info.gpuName || '';
    }

    const pose = {
        model: firstKey,
        computeMode: '', computeDetail: '', gpuName: '',
        timings,
        background: true,
        async detect(video, timeMs) {
            if (pending) throw new Error('上一格還在處理');
            let bitmap;
            try {
                bitmap = await createImageBitmap(video);
            } catch (err) {
                // 抓不到鏡頭畫面：不是 AI 的問題，main.js 交給鏡頭的自我修復處理（和 pose.js 一樣）
                err.frame = true;
                throw err;
            }
            return new Promise((resolve, reject) => {
                const id = ++nextId;
                pending = { id, resolve, reject };
                watchDetect(id, performance.now());
                const f = focus;
                focus = null;
                try {
                    worker.postMessage({ type: 'detect', id, bitmap, ts: timeMs, focus: f }, [bitmap]);
                } catch (err) {
                    clearTimeout(pending.timer);
                    pending = null;
                    bitmap.close();
                    reject(err);
                }
            });
        },
        lostReason: () => dead,
        // 改跟著畫面上這一點的人（11/22：YOLO 一次找到畫面裡每一個人，MediaPipe 沒有這個）：x、y 是鏡頭原始畫面的比例座標 0～1
        // 下一格才找；結果在那一格的 focus（'ok' 找到、'miss' 那裡沒有人，照常跟著原本的人）
        focusAt(x, y) {
            focus = { x, y };
        },
        // 重新啟動：換一個新的背景執行緒，引擎和模型檔都在記憶體裡，不用再下載
        async restart() {
            worker.terminate();
            fail(new Error('重新啟動中'));
            const fresh = await startWorker(files, FORCE_CPU, kptsOf(pose.model));
            setInfo(fresh.info);
            attach(fresh.worker);
        },
        // 同一家換大小（n ↔ s）：先下載新的模型檔，再用它重新啟動；失敗時回到原本的模型（錯誤標 recovered，照常可用）
        async useModel(key, onFraction) {
            if (!Object.prototype.hasOwnProperty.call(YOLO_FILES, key)) throw Object.assign(new Error('不認得的 YOLO 模型：' + key), { recovered: true });
            let data;
            try {
                data = await downloadModel(key, onFraction);
            } catch (err) {
                err.recovered = true;
                throw err;
            }
            const old = { model: files.model, key: pose.model };
            files.model = data;
            pose.model = key;
            try {
                await pose.restart();
            } catch (err) {
                console.warn('新模型無法啟動，改回原本的模型：', err);
                files.model = old.model;
                pose.model = old.key;
                await pose.restart();
                err.recovered = true;
                throw err;
            }
        },
        // 換成別家的模型時（js/ai/pose-source.js）：結束背景執行緒，還在等的那一格當作失敗
        close() {
            worker.terminate();
            fail(new Error('已換成別的模型'));
        }
    };
    setInfo(firstInfo);
    return pose;
}
