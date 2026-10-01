// 全站設定：外部套件版本、模型檔位置、測試用的網址參數

// MediaPipe 版本：固定版本號，避免官方更新造成網站壞掉
export const MEDIAPIPE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';

// 骨架模型（lite：最輕量、手機也跑得動）
export const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const params = new URLSearchParams(location.search);

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
