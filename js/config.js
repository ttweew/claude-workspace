// 全站設定：外部套件版本、模型檔位置、測試用的網址參數

// MediaPipe 版本：固定版本號，避免官方更新造成網站壞掉
export const MEDIAPIPE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';

// 骨架模型（lite：最輕量、手機也跑得動）
export const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const params = new URLSearchParams(location.search);

// 測試用：網址加上 ?cpu 會強制用 CPU，方便同一台裝置比較 GPU 與 CPU 的速度
export const FORCE_CPU = params.has('cpu');

// 網址加上 ?debug：一打開就顯示每個點的編號與名稱
export const SHOW_LABELS_AT_START = params.has('debug');
