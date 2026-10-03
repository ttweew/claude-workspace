// 全站設定：外部套件版本、模型檔位置、測試用的網址參數

// MediaPipe 版本：固定版本號，避免官方更新造成網站壞掉
// 兩個下載來源內容完全相同：第一個連不上（網路封鎖、服務中斷）時自動改用第二個
export const MEDIAPIPE_URLS = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1',
    'https://unpkg.com/@mediapipe/tasks-vision@1.0.1'
];

const params = new URLSearchParams(location.search);

// 骨架模型：預設 lite（最輕量、手機也跑得動）
// 測試用：網址加上 ?model=full 改用較大的 full 模型。模擬測試中鬼點更少，但運算約慢 1.5 倍、多下載 3.6 MB，
// 請用實際手機比較 FPS 再決定要不要換
const MODELS = {
    lite: { name: 'pose_landmarker_lite', size: 5.8e6 },
    full: { name: 'pose_landmarker_full', size: 9.4e6 }
};
const model = MODELS[params.get('model')] || MODELS.lite;
export const POSE_MODEL_NAME = model.name;
export const POSE_MODEL_SIZE = model.size;  // 檔案大小，用來計算下載進度
export const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/'
    + model.name + '/float16/1/' + model.name + '.task';

// 測試用：網址加上 ?cpu 會強制用 CPU，方便同一台裝置比較 GPU 與 CPU 的速度
export const FORCE_CPU = params.has('cpu');

// 鏡頭解析度：骨架模型內部只使用約 256×256 的影像，640×480 就足夠
// 實測解析度越高越慢（720p 約慢 3 成、1080p 慢一半以上），所以預設明確指定 640×480
// 測試用：網址加上 ?res=720 或 ?res=1080 可切換，方便比較 FPS 差距
const RESOLUTIONS = { 480: [640, 480], 720: [1280, 720], 1080: [1920, 1080] };
export const CAMERA_RESOLUTION = RESOLUTIONS[params.get('res')] || RESOLUTIONS[480];

// 網址加上 ?debug（測試模式）：一打開就顯示每個點的編號與名稱，運算標籤展開時也顯示各階段載入秒數
export const DEBUG = params.has('debug');
export const SHOW_LABELS_AT_START = DEBUG;

// 實驗中的功能：網址加上 ?lab=squat 才會出現（深蹲次數與深度），一般使用者看不到
export const LAB = params.get('lab') || '';

// AI 在背景執行緒運算（主畫面不會被 AI 卡住）；網址加 ?worker=0 改回在主畫面運算，方便用手機比較順暢度與 FPS
export const USE_WORKER = params.get('worker') !== '0';

// 骨架往前預測（js/predict.js）：網址加 ?predict=0 關掉，方便比較「跟手」的差別
export const PREDICT = params.get('predict') !== '0';
