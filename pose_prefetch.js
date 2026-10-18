// AI 骨架偵測：下載 MediaPipe 與骨架模型、選擇 GPU 或 CPU、暖機
// 這裡只負責準備好偵測器，畫面上的文字由 main.js 負責

import { MEDIAPIPE_URL, POSE_MODEL_URL, FORCE_CPU } from './config.js';
import { getGpuInfo, shortGpuName } from './gpu.js';

// 兩個要下載的大檔案（解壓縮後的大小），用來計算整體下載進度
// 伺服器回報的檔案大小可能是壓縮後的，不準，所以直接用固定版本的實際大小
const ENGINE_SIZE = 11.8e6;  // AI 引擎（WebAssembly）
const MODEL_SIZE = 5.8e6;    // 骨架模型

// 自己下載檔案，才能邊下載邊回報進度：
// onBytes(已下載位元組數)：每收到一段資料就通知一次
// streamed=true：一邊下載一邊交給 MediaPipe 讀取（reader），finished 為下載完成後的完整檔案
// streamed=false：只下載到瀏覽器快取裡，不另外保存檔案內容
function startDownload(url, onBytes, streamed) {
    let controller = null;
    const stream = streamed ? new ReadableStream({ start(c) { controller = c; } }) : null;
    const finished = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('AI 檔案下載失敗（HTTP ' + res.status + '）：' + url);
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (controller) {
                chunks.push(value);
                controller.enqueue(value);
            }
            received += value.length;
            onBytes(received);
        }
        if (!controller) return null;
        controller.close();
        const data = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }
        return data;
    })();
    finished.catch(err => controller && controller.error(err));
    return { reader: stream && stream.getReader(), finished: finished };
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
        bytes: name => received => { files[name].received = received; report(); },
        done: name => () => { files[name].done = true; report(); }
    };
}

// 讓瀏覽器有機會先把畫面上的文字更新出來，再做會卡住畫面的工作
function letScreenUpdate() {
    return new Promise(resolve => setTimeout(resolve, 50));
}

// 建立骨架偵測器
// model：下載中的模型（reader）或已下載完成的模型檔（Uint8Array）
function createPoseLandmarker(vision, fileset, delegate, model) {
    return vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate: delegate },
        runningMode: 'VIDEO',
        numPoses: 1
    });
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
// onProgress({ stage, fraction, delegate })：目前進行到哪個階段
//   stage：'download' 下載檔案（fraction 為 0～1 的整體下載進度）、'start' 啟動 AI、'warmup' 暖機
// 回傳 { vision, landmarker, computeMode, computeDetail, gpuName, timings }
//   computeMode：'GPU' 或 'CPU'；computeDetail：GPU 時為晶片名稱，CPU 時為原因
//   timings：各階段花費的秒數 { download, start, warmup }，用來找出載入慢在哪裡
export async function loadPoseModel(onProgress) {
    const t0 = performance.now();
    const tracker = downloadTracker(fraction => onProgress({ stage: 'download', fraction: fraction }));
    // 骨架模型一開始就下載，不用等 AI 引擎
    const download = startDownload(POSE_MODEL_URL, tracker.bytes('model'), true);
    download.finished.then(tracker.done('model'), () => {});
    const vision = await import(MEDIAPIPE_URL + '/vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_URL + '/wasm');

    // AI 引擎也先自己下載（才算得出進度）。下載後檔案存在瀏覽器快取裡，
    // MediaPipe 再讀同一個網址時直接從快取拿，不會重複下載，瀏覽器也能沿用編譯好的結果
    const engine = startDownload(fileset.wasmBinaryPath, tracker.bytes('engine'), false);
    engine.finished.then(tracker.done('engine'), () => {});
    await engine.finished;

    // 優先用 GPU（圖形處理器，手機與電腦的晶片都有內建）加速，不支援時改用 CPU
    const gpu = getGpuInfo();
    const useGpu = !FORCE_CPU && gpu && !gpu.software;
    let downloadedAt = 0;
    Promise.all([engine.finished, download.finished]).then(() => {
        downloadedAt = performance.now();
        onProgress({ stage: 'start', delegate: useGpu ? 'GPU' : 'CPU' });
    }, () => {});

    let landmarker, computeMode, computeDetail;
    if (FORCE_CPU) {
        landmarker = await createPoseLandmarker(vision, fileset, 'CPU', download.reader);
        [computeMode, computeDetail] = ['CPU', '測試模式'];
    } else if (!useGpu) {
        // 沒有實體 GPU（例如軟體模擬）時，直接用 CPU 反而比較快
        landmarker = await createPoseLandmarker(vision, fileset, 'CPU', download.reader);
        [computeMode, computeDetail] = ['CPU', '未偵測到可用的 GPU'];
    } else {
        try {
            landmarker = await createPoseLandmarker(vision, fileset, 'GPU', download.reader);
            [computeMode, computeDetail] = ['GPU', shortGpuName(gpu.name)];
        } catch (gpuErr) {
            console.warn('GPU 無法使用，改用 CPU：', gpuErr);
            landmarker = await createPoseLandmarker(vision, fileset, 'CPU', await download.finished);
            [computeMode, computeDetail] = ['CPU', '此裝置無法使用 GPU'];
        }
    }
    const createdAt = performance.now();

    onProgress({ stage: 'warmup' });
    await letScreenUpdate();
    const warmStart = performance.now();
    warmUp(landmarker);
    const end = performance.now();

    const seconds = ms => Math.round(ms / 100) / 10;
    const timings = {
        download: seconds((downloadedAt || createdAt) - t0),
        start: seconds(createdAt - (downloadedAt || createdAt)),
        warmup: seconds(end - warmStart)
    };
    console.info('AI 載入各階段秒數：', timings);
    return { vision, landmarker, computeMode, computeDetail, gpuName: gpu ? gpu.name : '', timings };
}
