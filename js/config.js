// 全站設定：外部套件版本、模型檔位置、測試用的網址參數

// MediaPipe 版本：固定版本號，避免官方更新造成網站壞掉
// 兩個下載來源內容完全相同：第一個連不上（網路封鎖、服務中斷）時自動改用第二個
// 換版本時，sw.js 裡的版本號和 AI_CACHE 名稱也要一起改（離線功能才會存新版、清掉舊版）
export const MEDIAPIPE_URLS = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1',
    'https://unpkg.com/@mediapipe/tasks-vision@1.0.1'
];

const params = new URLSearchParams(location.search);

// 骨架模型：lite（最輕量、手機也跑得動，預設）、full（比較準、鬼點更少，但運算約慢 1.5 倍、多下載 3.6 MB）
// 首頁「AI 模型」選單可以選 lite、full 或自動（js/ai/model-choice.js，會記住）
// 網址加上 ?model=full（或 lite、auto）可以直接指定，方便測試（不會記住）
// size：檔案大小，用來計算下載進度
export const MODELS = {
    lite: { name: 'pose_landmarker_lite', size: 5.8e6 },
    full: { name: 'pose_landmarker_full', size: 9.4e6 }
};
export function modelUrl(key) {
    const name = MODELS[key].name;
    return 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/' + name + '/float16/1/' + name + '.task';
}
// 網址的值要先比對清單，不能直接拿去查 MODELS（'constructor' 這種 JavaScript 內建的名字查得到東西，網頁會壞掉）
const urlModel = params.get('model');
export const MODEL_FROM_URL = urlModel === 'auto' || Object.keys(MODELS).includes(urlModel) ? urlModel : '';

// 測試用：網址加上 ?cpu 會強制用 CPU，方便同一台裝置比較 GPU 與 CPU 的速度
export const FORCE_CPU = params.has('cpu');

// 鏡頭解析度：骨架模型內部只使用約 256×256 的影像，640×480 就足夠
// 實測解析度越高越慢（720p 約慢 3 成、1080p 慢一半以上），所以預設明確指定 640×480
// 測試用：網址加上 ?res=720 或 ?res=1080 可切換，方便比較 FPS 差距
const RESOLUTIONS = { 480: [640, 480], 720: [1280, 720], 1080: [1920, 1080] };
const urlRes = params.get('res');
export const CAMERA_RESOLUTION = Object.keys(RESOLUTIONS).includes(urlRes) ? RESOLUTIONS[urlRes] : RESOLUTIONS[480];

// 每秒格數（老師 10/12 回饋：每秒 30 格感覺很低）：使用者可以選 30、60、90、120（js/platform/camera.js）
// 30 是預設：大部分手機鏡頭預設送每秒 30 格，AI 最多也只能算 30 格
// 60 格以上是實驗：要鏡頭支援、AI 每格 16.7 毫秒（60 格）／8.3 毫秒（120 格）內算完、螢幕更新夠快、手機不過熱降速
// 網址加上 ?fps=60（或 90、120、auto）可以直接指定，方便測試（不會記住）
// 'auto'（自動）：依 AI 實際的速度在 30～60 格之間自動調整（js/ai/advisor.js 的 AutoFps）
export const FPS_CHOICES = [30, 60, 90, 120];
const urlFps = params.get('fps') === 'auto' ? 'auto' : Number(params.get('fps'));
export const FPS_FROM_URL = urlFps === 'auto' || FPS_CHOICES.includes(urlFps) ? urlFps : 0;

// 網址加上 ?debug（測試模式）：一打開就顯示每個點的編號與名稱，運算標籤展開時也顯示各階段載入秒數
export const DEBUG = params.has('debug');
export const SHOW_LABELS_AT_START = DEBUG;

// 實驗中的功能：網址加上 ?lab=squat 才會出現（深蹲次數與深度），一般使用者看不到
export const LAB = params.get('lab') || '';

// AI 在背景執行緒運算（主畫面不會被 AI 卡住）；網址加 ?worker=0 改回在主畫面運算，方便用手機比較順暢度與 FPS
export const USE_WORKER = params.get('worker') !== '0';

// 骨架往前預測（js/skeleton/predict.js）：網址加 ?predict=0 關掉，方便比較「跟手」的差別
export const PREDICT = params.get('predict') !== '0';
