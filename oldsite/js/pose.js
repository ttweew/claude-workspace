// AI 骨架偵測：下載 MediaPipe 與骨架模型、選擇 GPU 或 CPU、暖機
// 這裡只負責準備好偵測器，畫面上的文字由 main.js 負責

import { MEDIAPIPE_URL, POSE_MODEL_URL, FORCE_CPU } from './config.js';
import { getGpuInfo, shortGpuName } from './gpu.js';

// 自己下載骨架模型（約 5.8 MB）：
// 1. 網頁一打開就開始下載，和 AI 引擎同時進行，不用排隊
// 2. 邊下載邊回報進度，畫面上可以顯示百分比
// reader：一邊下載一邊交給 MediaPipe 讀取；finished：下載完成後的完整檔案（改用 CPU 重試時使用）
function startModelDownload(onProgress) {
    let controller;
    const stream = new ReadableStream({ start(c) { controller = c; } });
    const finished = (async () => {
        const res = await fetch(POSE_MODEL_URL);
        if (!res.ok) throw new Error('骨架模型下載失敗（HTTP ' + res.status + '）');
        const total = Number(res.headers.get('Content-Length')) || 0;
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            controller.enqueue(value);
            received += value.length;
            if (total) onProgress(Math.min(1, received / total));
        }
        controller.close();
        const data = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }
        return data;
    })();
    finished.catch(err => controller.error(err));
    return { reader: stream.getReader(), finished: finished };
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
// onProgress(0～1)：模型下載進度
// 回傳 { vision, landmarker, computeMode, computeDetail, gpuName }
//   computeMode：'GPU' 或 'CPU'；computeDetail：GPU 時為晶片名稱，CPU 時為原因
export async function loadPoseModel(onProgress) {
    const download = startModelDownload(onProgress);
    const vision = await import(MEDIAPIPE_URL + '/vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_URL + '/wasm');

    // 優先用 GPU（圖形處理器，手機與電腦的晶片都有內建）加速，不支援時改用 CPU
    const gpu = getGpuInfo();
    let landmarker, computeMode, computeDetail;
    if (FORCE_CPU) {
        landmarker = await createPoseLandmarker(vision, fileset, 'CPU', download.reader);
        [computeMode, computeDetail] = ['CPU', '測試模式'];
    } else if (!gpu || gpu.software) {
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

    warmUp(landmarker);
    return { vision, landmarker, computeMode, computeDetail, gpuName: gpu ? gpu.name : '' };
}
