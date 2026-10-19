// 程式起點：取得畫面元素、串接鏡頭與 AI 骨架偵測、處理按鈕事件

import { SHOW_LABELS_AT_START, DEBUG, MODELS, PREDICT, FPS_CHOICES } from '../config.js';
import { isCameraSupported, openCamera, stopCamera, shouldMirror, activeDeviceId, listCameras, cameraErrorMessage, cameraFrameRate, maxFrameRate, getFrameRate, setFrameRate, getFpsChoice, isAutoFps, setAutoRate, changeFrameRate } from '../platform/camera.js';
import { loadPoseModel } from '../ai/pose.js';
import { MODEL_CHOICES, getModelChoice, setModelChoice, rememberAutoModel, autoRemembered, modelToLoad } from '../ai/model-choice.js';
import { drawSkeleton } from '../ui/draw.js';
import { videoRect, updateLabels, hideLabels, nearestPoint } from '../ui/labels.js';
import { FpsCounter } from '../ai/fps.js';
import { SpeedMeter, AutoFps, ADVICE, advise, median, loadSkipped, skipAdvice } from '../ai/advisor.js';
import { PosePipeline } from '../skeleton/pipeline.js';
import { WorldStabilizer } from '../skeleton/world.js';
import { predictPose } from '../skeleton/predict.js';
import { getDerivedPoints } from '../skeleton/landmarks.js';
import { framingAdvice, FramingHint, NO_PERSON, LEGS_BLOCKED } from '../analysis/framing.js';
import { PoseRecorder, buildFile, downloadBlob, recordingName, MAX_SECONDS, LIMIT_MINUTES, JSON_MB_PER_MINUTE } from '../data/recorder.js';
import { updateDataPanel, updateViewInfo } from '../ui/datapanel.js';
import { Hud } from '../ui/hud.js';
import { Sound, FramingSound, LEVEL_NAMES } from '../ui/sound.js';
import { isWakeLockSupported, isScreenKeptOn, keepScreenOn, allowScreenOff } from '../platform/screen.js';
import { getWorkout, onWorkoutChange, setWorkoutLocked, formatSeconds } from '../analysis/workouts.js';
import { WorkoutTracker } from '../analysis/tracker.js';
import { errorShort, whyText } from '../analysis/form.js';
import { makeSnapshot, addSnapshot, loadSnapshots } from '../analysis/validate.js';
import { cloud } from '../cloud/cloud.js';
import { shouldAskCloud, loadAsked, saveAsked } from '../ui/cloud-ask.js';
import { setupStartPick } from '../ui/start-pick.js';
import { clearerSide } from '../skeleton/landmarks.js';
import { summarize, compare, describe, saveSession, loadHistory, clearHistory } from '../analysis/session.js';
import { Voice } from '../ui/voice.js';
import { LightMeter, averageLuma } from '../analysis/light.js';
import { setupOffline, forgetAiFiles } from '../platform/offline.js';
import { unsupportedAdvice, describeDevice } from '../platform/support.js';

// ---------- 畫面元素 ----------
const stage = document.getElementById('stage');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const labelBtn = document.getElementById('labelBtn');
const cameraSelect = document.getElementById('cameraSelect');
const statusText = document.getElementById('status');
const poseStatus = document.getElementById('poseStatus');
const modelStatus = document.getElementById('modelStatus');
const modelProgress = document.getElementById('modelProgress');
const modelHint = document.getElementById('modelHint');
const perfBtn = document.getElementById('perfBtn');
const labelLayer = document.getElementById('labels');
const dataBtn = document.getElementById('dataBtn');
const soundBtn = document.getElementById('soundBtn');
const dataPanel = document.getElementById('dataPanel');
const dataRows = document.getElementById('dataRows');
const viewInfo = document.getElementById('viewInfo');
const recordBtn = document.getElementById('recordBtn');
const countdownSelect = document.getElementById('countdownSelect');
const limitSelect = document.getElementById('limitSelect');
const limitNote = document.getElementById('limitNote');
const fpsSelect = document.getElementById('fpsSelect');  // 首頁「畫面流暢度」
const fpsLive = document.getElementById('fpsLive');      // 鏡頭畫面：點開運算標籤時出現
const fpsHint = document.getElementById('fpsHint');
const modelSelect = document.getElementById('modelSelect');  // 首頁「AI 模型」
const modelLive = document.getElementById('modelLive');      // 鏡頭畫面：點開運算標籤時出現
const modelPickHint = document.getElementById('modelPickHint');
const adviceBox = document.getElementById('advice');      // 速度建議（js/ai/advisor.js）
const adviceText = document.getElementById('adviceText');
const adviceYes = document.getElementById('adviceYes');
const adviceNo = document.getElementById('adviceNo');
const autoNote = document.getElementById('autoNote');  // 自動調整時短暫說明換了什麼
const lightNote = document.getElementById('lightNote');  // 光線太暗的提醒
const countdownEl = document.getElementById('countdown');
const recNoticeEl = document.getElementById('recNotice');
const recordInfo = document.getElementById('recordInfo');
const csvBtn = document.getElementById('csvBtn');
const jsonBtn = document.getElementById('jsonBtn');
const panelToggle = document.getElementById('panelToggle');
const rawModeBtn = document.getElementById('rawModeBtn');
const smoothModeBtn = document.getElementById('smoothModeBtn');
const panelModeNote = document.getElementById('panelModeNote');
const panelBody = document.getElementById('panelBody');
const banner = document.getElementById('banner');
const hudRoot = document.getElementById('hud');
const hudRepsBox = document.getElementById('hudRepsBox');  // 次數或秒數（選了運動模式才顯示）
const hudRepsName = document.getElementById('hudRepsName');
const formTip = document.getElementById('formTip');  // 動作做錯時畫面上方的紅字
const formTipText = document.getElementById('formTipText');
const formWhy = document.getElementById('formWhy');    // 紅字下面說出原因的小字
const summaryBox = document.getElementById('summary');      // 首頁：這次運動的總結
const summaryLines = document.getElementById('summaryLines');
const cloudAsk = document.getElementById('cloudAsk');       // 總結下面：問一次要不要打開雲端同步
let cloudAsked = loadAsked();
const historyBox = document.getElementById('historyBox');   // 首頁：運動紀錄
const historyList = document.getElementById('historyList');
const hudReps = document.getElementById('hudReps');
const repToast = document.getElementById('repToast');
const hud = new Hud(hudRoot);

// ---------- 狀態 ----------
let currentStream = null;
let cameraRequest = 0;      // 每次開啟或關閉鏡頭就加 1，用來丟棄已經過時的開啟請求
let pose = null;           // AI 偵測器（loadPoseModel 的結果），載入完成前為 null
let lastVideoTime = -1;
let frameRequest = null;    // 下一次偵測的排程，關閉鏡頭時取消
let failures = 0;           // 連續偵測出錯的次數
let detecting = false;      // 有一格正在偵測（背景執行緒還沒回傳結果）
let waitingFrame = null;    // 偵測中又來了新畫面：記下它，算完馬上接著算
let streamGeneration = 0;   // 每次換鏡頭、關鏡頭、AI 重新啟動就加 1；比這個舊的偵測結果直接丟掉
let restarting = false;     // AI 正在重新啟動（或已經放棄），這段時間不偵測
let lastRestart = -Infinity;
let poseBroken = false;     // 重新啟動也救不回來；使用者重新開啟鏡頭時再試一次
// 「顯示編號」的開關會記在瀏覽器裡，下次打開網站維持上次的選擇；網址加 ?debug 則一律顯示
const LABELS_KEY = 'showLabels';
function loadLabelSetting() {
    try {
        return localStorage.getItem(LABELS_KEY) === '1';
    } catch (err) {
        return false;  // 無痕模式等情況可能無法讀取，就用預設的不顯示
    }
}
function saveLabelSetting(on) {
    try {
        localStorage.setItem(LABELS_KEY, on ? '1' : '0');
    } catch (err) {
        // 無法儲存也不影響使用，只是下次不會記得
    }
}
let showLabels = SHOW_LABELS_AT_START || loadLabelSetting();  // 是否在主要關節旁邊標出編號與名稱
let perfExpanded = false;   // 運算資訊標籤是否展開顯示詳細資訊
let lastPose = null;        // 最近一次偵測到的關鍵點，點選畫面時用來找最近的點
let picked = null;          // 使用者點選要查看的點與顯示期限 { id, until }
const fps = new FpsCounter();        // AI 每秒算幾格
const cameraFps = new FpsCounter();  // 鏡頭每秒送來幾格（AI 最多只能算這麼多格）
let lastCameraFrame = null;          // 上一次看到的鏡頭畫面（算鏡頭格數用）
const recentMs = [];                 // 最近 30 格 AI 每格花幾毫秒（運算標籤點開時顯示）
const speedMeter = new SpeedMeter(); // 速度建議：量這台裝置實際跑多快
let measureFrom = 0;                 // 從這個時間 3 秒後才開始量（剛開鏡頭、從背景回來的幾秒比較慢，不準）
let lastPersonAt = -Infinity;        // 最近一次畫面裡有人的時間
let adviceDone = false;              // 這次開鏡頭已經量完、給過建議（換格數重開鏡頭會再量一次）
let shownAdvice = null;              // 畫面上正在顯示的建議
const secondMs = [];                 // 這一秒每格花幾毫秒（自動調每秒格數用）
const autoFps = new AutoFps();       // 每秒格數選「自動」時：依實際速度在 30、60 之間調整
const lightMeter = new LightMeter(); // 光線偵測：每秒算一次畫面平均亮度（js/analysis/light.js）
const lightCanvas = document.createElement('canvas');  // 縮成 32×24 的小圖來算亮度，很省
lightCanvas.width = 32;
lightCanvas.height = 24;
const lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });
const pipeline = new PosePipeline();  // 平滑、擋鬼點、角度、拍攝方向
const worldStabilizer = new WorldStabilizer();  // 3D 座標：平滑＋骨頭長度限制（錄製時另外存一份）
// 運動模式（js/analysis/workouts.js）：選了動作就計算次數（棒式計時），大字儀表板和骨架旁的角度跟著換
let workout = getWorkout();
// 次數（棒式計時）＋動作錯誤（js/analysis/tracker.js）；重播分析也用同一套
let tracker = new WorkoutTracker(workout.id);
let sessionStart = Date.now();            // 這次運動從什麼時候開始（開鏡頭、換動作）
// 一直顯示角度的關節（例如深蹲是左右膝、髖，伏地挺身是左右肘、髖）
let shownAngleKeys = [];
const sound = new Sound();             // 提示音：所有聲音共用同一個音量（關、小、中、大）
const voice = new Voice(() => sound.level);  // 語音提醒（動作錯誤、次數）：音量和提示音一樣
const voiceToggle = document.getElementById('voiceToggle');
const advancedTitle = document.getElementById('advancedTitle');
const framingSound = new FramingSound(name => sound.play(name));  // 離開畫面、站位不對、站好了
const framing = new FramingHint();    // 入鏡提示（請往後退、請站到中間…）
const recorder = new PoseRecorder();  // 錄製關鍵點資料，匯出 CSV / JSON
let lastPanelUpdate = 0;              // 數據面板上次更新的時間（每秒更新 5 次，數字才看得清楚）
let videoSize = '';                   // 鏡頭畫面大小（例如 640x480）；手機轉向時會改變

// ---------- AI 模型 ----------

// 首頁與鏡頭畫面同時顯示 AI 模型的載入狀態
function setModelStatus(text) {
    if (modelStatus.textContent !== text) modelStatus.textContent = text;
    setPoseStatus(text);
}

// 鏡頭畫面左上角的狀態標籤；kind 決定顏色：'ok' 綠、'warn' 橘、'error' 紅，沒有則為預設深藍
// 需要使用者調整站位的提示（warn）改用畫面中央的大字橫幅，站遠也看得到；這時左上角的小標籤先收起來，不重複顯示
// 每一格都會呼叫，內容沒變就不動畫面，比較省電
function setPoseStatus(text, kind) {
    if (poseStatus.textContent !== text) poseStatus.textContent = text;
    if (poseStatus.dataset.kind !== (kind || '')) poseStatus.dataset.kind = kind || '';
    const warn = kind === 'warn';
    if (warn && banner.textContent !== text) banner.textContent = text;
    // 深蹲實驗：每一下的提示和橫幅在同一個位置，橫幅（要使用者調整站位）比較重要
    if (warn && !repToast.hidden) repToast.hidden = true;
    if (banner.hidden === warn) banner.hidden = !warn;
    if (poseStatus.hidden !== warn) poseStatus.hidden = warn;
}

// 偵測中每一格：顯示入鏡提示，狀況改變時發出提示音（離開畫面「逼逼逼」、站位不對「逼逼」、站好了「叮」）
// 「偵測中」「腳被擋住了」不是使用者站錯，不響
function showHint(text, kind, now) {
    setPoseStatus(text, kind);
    const category = text === NO_PERSON.text ? 'away'
        : kind === 'ok' ? 'ok'
        : kind === 'warn' && text !== LEGS_BLOCKED.text ? 'wrong' : null;
    framingSound.update(category, text, now);
}

// 畫布大小 = 影像實際顯示的大小 × 螢幕像素密度
// 手機螢幕一個點有 2～3 個實體像素，畫布太小會被放大而變模糊；回傳像素密度，畫線時用來換算粗細
function fitOverlay() {
    const rect = videoRect(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (overlay.width !== w || overlay.height !== h) {
        overlay.width = w;
        overlay.height = h;
    }
    return dpr;
}

// 進度條長度：下載佔前 85%，後面的啟動與暖機無法算出進度，給固定位置
// 不顯示百分比，避免使用者看到「96%」就以為快好了
const STAGE_TEXT = { download: '下載 AI 檔案…', start: '啟動 AI 運算…', warmup: '最後準備中…' };
function showLoadingStage(progress) {
    const text = progress.stage === 'start' && progress.delegate === 'GPU' ? '啟動 GPU 加速…' : STAGE_TEXT[progress.stage];
    const width = progress.stage === 'download' ? progress.fraction * 85 : progress.stage === 'start' ? 90 : 96;
    setModelStatus('AI 準備中：' + text);
    modelProgress.firstElementChild.style.width = width + '%';
}

// 載入結束：成功時進度條補滿、變綠後淡出；失敗時直接收起
function finishLoading(success) {
    modelHint.hidden = true;
    if (success) {
        modelProgress.firstElementChild.style.width = '100%';
        modelProgress.classList.add('done', 'hide');
        // 淡出後收起來，不留一塊空白
        setTimeout(() => { modelProgress.hidden = true; }, 1400);
    } else {
        modelProgress.hidden = true;
    }
}

// 網頁一打開就在背景載入骨架模型，按下開啟鏡頭時通常已經準備好；失敗時鏡頭仍可正常使用
// 網路一時不穩（例如學校 Wi-Fi 斷一下）時自動重試，不用使用者重新整理頁面
const RETRY_DELAYS = [2, 5];  // 第 1、2 次重試前等幾秒
let loadingPose = false;
let loadCount = 0;  // 總共載入過幾次；每次都用新的次數，瀏覽器才不會沿用上次失敗的結果
async function initPose() {
    if (pose || loadingPose) return;
    loadingPose = true;
    for (let attempt = 0; ; attempt++) {
        const result = await tryLoadPose(loadCount++);
        if (result === true) break;
        // 這支手機的瀏覽器跑不了 AI：重試也沒用，直接說明原因與怎麼辦（鏡頭仍可開啟）
        if (result === 'unsupported') {
            setModelStatus('這支手機的瀏覽器無法執行 AI（不支援 WebGL2）。' + unsupportedAdvice());
            finishLoading(false);
            break;
        }
        await forgetAiFiles();
        if (attempt >= RETRY_DELAYS.length) {
            setModelStatus('AI 模型載入失敗，請檢查網路（鏡頭仍可使用）');
            finishLoading(false);
            break;
        }
        const wait = RETRY_DELAYS[attempt];
        setModelStatus('AI 載入失敗，' + wait + ' 秒後自動重試…');
        modelProgress.firstElementChild.style.width = '0%';
        await new Promise(resolve => setTimeout(resolve, wait * 1000));
    }
    loadingPose = false;
}
// 全部重試都失敗後，網路恢復時再自動試一次
window.addEventListener('online', () => {
    if (pose || loadingPose) return;
    modelProgress.hidden = false;
    modelHint.hidden = false;
    initPose();
});

// 載入一次；成功回傳 true，失敗回傳 false，這支手機根本跑不了 AI 時回傳 'unsupported'
async function tryLoadPose(attempt) {
    const startTime = performance.now();
    try {
        const result = await loadPoseModel(progress => {
            if (!pose) showLoadingStage(progress);
        }, attempt);
        if (result.gpuName) perfBtn.title = '瀏覽器回報的 GPU：' + result.gpuName;
        pose = result;
        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);
        setModelStatus('AI 模型已就緒（載入 ' + seconds + ' 秒）');
        finishLoading(true);
        updatePerfInfo();
        showModelChoice();
        checkModel();
        return true;
    } catch (err) {
        console.error(err);
        return err && err.unsupported ? 'unsupported' : false;
    }
}

// 運算資訊標籤：平常只顯示「GPU · 30 FPS」
// 點一下展開成「GPU：晶片名稱 · 30 FPS · 螢幕保持亮著」
// 測試模式（網址加 ?debug）另外顯示「載入花費：下載 X 秒、啟動 Y 秒、暖機 Z 秒」，給開發團隊找出載入慢在哪裡
function updatePerfInfo() {
    if (!pose) return;
    const parts = [perfExpanded ? pose.computeMode + '：' + pose.computeDetail : pose.computeMode];
    if (currentStream) {
        const ai = fps.value ? fps.value + ' FPS' : 'FPS 計算中';
        // 選了每秒 60 格以上：分開顯示鏡頭送來幾格、AI 算了幾格，才知道卡在鏡頭還是 AI
        const high = getFrameRate() > 30;
        if (high) parts.push('鏡頭 ' + (cameraFps.value || '…') + ' · AI ' + ai);
        else parts.push(ai);
        // 點開時寫出鏡頭的解析度和最多每秒幾格：卡在 30 時一眼看出是鏡頭的上限（同學 10/13 筆電測試）
        if (perfExpanded) {
            const size = video.videoWidth ? video.videoWidth + '×' + video.videoHeight : '';
            const max = cameraMaxFps ? '最多 ' + cameraMaxFps : '';
            const rate = high ? (max && max + ' 格') : '每秒 ' + (cameraFps.value || '…') + ' 格' + (max && '（' + max + '）');
            const info = [size, rate].filter(Boolean).join('，');
            if (info) parts.push('鏡頭 ' + info);
            if (isAutoFps()) parts.push('每秒格數自動，目前 ' + getFrameRate() + ' 格');
            if (tracker.baseline) parts.push('校正：站直膝 ' + tracker.baseline.knee + '°、手機傾斜 ' + Math.abs(tracker.baseline.tilt).toFixed(1) + '°');
            if (lightMeter.luma !== null) parts.push('畫面亮度 ' + Math.round(lightMeter.luma) + (lightMeter.dark ? '（太暗）' : ''));
            // AI 每格算幾毫秒、用哪個模型：組員回報手機速度時看這裡
            if (recentMs.length) parts.push('AI 每格 ' + Math.round(median(recentMs)) + ' 毫秒（' + modelLabel() + '）');
        }
    }
    if (currentStream && perfExpanded) {
        parts.push(!isWakeLockSupported() ? '此瀏覽器無法保持螢幕亮著'
            : isScreenKeptOn() ? '螢幕保持亮著' : '螢幕可能自動變暗');
    }
    if (perfExpanded && DEBUG) {
        const t = pose.timings;
        parts.push('載入花費：下載 ' + t.download + ' 秒、啟動 ' + t.start + ' 秒、暖機 ' + t.warmup + ' 秒');
    }
    perfBtn.textContent = parts.join(' · ');
    perfBtn.hidden = false;
    fpsLive.hidden = modelLive.hidden = !(perfExpanded && currentStream);
}

// 排下一次偵測：鏡頭每送來一格新畫面，就偵測一次
// 支援的瀏覽器用 requestVideoFrameCallback，新畫面到了才叫醒程式；
// 舊瀏覽器用 requestAnimationFrame，跟著螢幕更新（60～120 次／秒）檢查有沒有新畫面
// 鏡頭通常每秒 30 格，在 120Hz 螢幕的手機上，前者被叫醒的次數只有後者的 1/4，比較省電、不發燙
const VIDEO_FRAMES = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
function scheduleDetect() {
    frameRequest = VIDEO_FRAMES ? video.requestVideoFrameCallback(detectPose) : requestAnimationFrame(detectPose);
}
function cancelDetect() {
    if (frameRequest === null) return;
    if (VIDEO_FRAMES) video.cancelVideoFrameCallback(frameRequest);
    else cancelAnimationFrame(frameRequest);
    frameRequest = null;
}

// 偵測器壞掉時自動重新啟動，不用使用者重新整理頁面
// 常見情況：手機切到背景或鎖定螢幕，系統收回 GPU，回來後骨架就再也不出現
const MAX_FAILURES = 10;  // 連續出錯這麼多格（約 0.3 秒）才重新啟動，偶爾一格出錯不用大動作
async function restartPose(reason) {
    restarting = true;
    streamGeneration++;
    console.warn('AI 重新啟動：' + reason);
    clearPose();
    // 重新啟動後速度可能不一樣（例如 GPU 失效改用 CPU）：重新量
    resetSpeedMeter();
    // 5 秒內又壞掉，代表重新啟動也救不回來，不要一直重試
    if (performance.now() - lastRestart < 5000) {
        giveUpPose();
        return;
    }
    setPoseStatus('AI 重新啟動中…');
    try {
        await pose.restart();
    } catch (err) {
        console.error(err);
        giveUpPose();
        return;
    }
    lastRestart = performance.now();
    failures = 0;
    pipeline.reset();
    updatePerfInfo();
    restarting = false;
}

function giveUpPose() {
    poseBroken = true;
    setPoseStatus('AI 無法使用，請關閉鏡頭重開，或重新整理頁面', 'error');
}

// 清掉畫面上的骨架、標籤與儀表板
function clearPose() {
    hidePose();
    framing.reset();
    framingSound.reset();
}
function hidePose() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    lastPose = null;
    hideLabels();
    hud.update(null);
}
const KEEP_POSE_MS = 200;  // 偵測不到人時，上一格的骨架最多再留這麼久
let lastSeen = 0;          // 最後一次偵測到人的時間

// 每一格新畫面做一次骨架偵測，並把關鍵點、連線（與編號）畫出來
// frame：requestVideoFrameCallback 提供的畫面資訊；用「第幾格」判斷是不是新畫面，
// 不用影像時間（有些瀏覽器的鏡頭影像時間不會每格都變，會漏掉畫面）
function detectPose(time, frame) {
    frameRequest = null;
    if (!currentStream) return;
    scheduleDetect();
    noteCameraFrame(frame);
    if (!pose || restarting) return;
    const lostReason = pose.lostReason();
    if (lostReason) {
        restartPose(lostReason);
        return;
    }
    const frameId = frame ? 'f' + frame.presentedFrames : video.currentTime;
    if (video.readyState >= 2) countCameraFrame(frame);
    if (video.readyState < 2 || frameId === lastVideoTime) return;
    // 背景執行緒還在算上一格：先記下「有新畫面」，算完馬上接著算最新的這一格（不排隊、也不空等下一格）
    if (detecting) {
        waitingFrame = frameId;
        return;
    }
    startDetect(frameId);
}

// 鏡頭每秒送來幾格：requestVideoFrameCallback 有「已經顯示幾格」，兩次叫醒之間送來幾格都算得到；
// 舊瀏覽器沒有，只能看影像時間有沒有變
function countCameraFrame(frame) {
    const id = frame ? frame.presentedFrames : video.currentTime;
    if (id === lastCameraFrame) return;
    const frames = frame && lastCameraFrame !== null ? Math.max(1, id - lastCameraFrame) : 1;
    lastCameraFrame = id;
    if (cameraFps.tick(performance.now(), frames)) updatePerfInfo();
}

// 送一格去偵測；結果回來後畫出來，若等待期間又有新畫面，馬上接著偵測
function startDetect(frameId) {
    lastVideoTime = frameId;
    detecting = true;
    const generation = streamGeneration;
    const now = performance.now();
    const done = () => {
        detecting = false;
        const next = waitingFrame;
        waitingFrame = null;
        if (next !== null && next !== lastVideoTime && generation === streamGeneration && currentStream && !restarting) startDetect(next);
    };
    pose.detect(video, now).then(result => {
        // 等結果的期間換了鏡頭、關了鏡頭或 AI 重新啟動：這一格作廢
        if (generation === streamGeneration && currentStream && !restarting) {
            measureFrame(performance.now() - now, !!result.landmarks);
            try {
                showResult(result, now);
                failures = 0;
                frameFailures = 0;
            } catch (err) {
                detectFailed(err);
            }
        }
        done();
    }, err => {
        if (generation === streamGeneration && currentStream && !restarting) {
            if (err && err.frame) frameFailed(err);
            else detectFailed(err);
        }
        done();
    });
}

// ---------- 鏡頭畫面停住了：自我修復 ----------
// 鏡頭開著、網頁在前景，卻一直沒有新畫面（iPhone 省電模式、從背景切回來時畫面可能停在最後一格；鏡頭驅動偶爾卡住）：
// 骨架、次數都停在最後一格，使用者會以為網站當掉。先試著繼續播放；還是沒有就重新開啟同一顆鏡頭（錄製中會先停止，錄到的保留）
// 重開過還是停住：不再一直重開，請使用者關掉鏡頭重開
const FROZEN = { playMs: 3000, restartMs: 8000, retryMs: 30000 };
let lastFrameKey = null;      // 上一格鏡頭畫面（看是不是新畫面）
let lastFrameAt = 0;          // 最近一次收到新畫面的時間
let frozenRestartAt = -Infinity;   // 最近一次因為畫面停住而重開鏡頭的時間
let frozenTold = false;
let frameFailures = 0;        // 連續抓不到鏡頭畫面的次數（js/ai/pose.js 的 err.frame）
function noteCameraFrame(frame) {
    const key = frame ? frame.presentedFrames : video.currentTime;
    if (key === lastFrameKey) return;
    lastFrameKey = key;
    lastFrameAt = performance.now();
    frozenTold = false;
}
function resetFrozenWatch() {
    lastFrameKey = null;
    lastFrameAt = performance.now();
    frameFailures = 0;
}
let frozenTick = performance.now();
setInterval(() => {
    // 這個檢查本身晚了很久才執行（電腦睡眠、網頁整個卡住）：那段時間沒有畫面是正常的，重新計時，不要誤判成鏡頭停住
    const tick = performance.now();
    const late = tick - frozenTick > 2500;
    frozenTick = tick;
    if (late) resetFrozenWatch();
    if (!currentStream || document.hidden || late) return;
    const idle = performance.now() - lastFrameAt;
    if (idle < FROZEN.playMs) return;
    if (video.paused) video.play().catch(() => {});
    if (idle < FROZEN.restartMs || frozenTold) return;
    fixCamera('鏡頭畫面停住 ' + Math.round(idle / 1000) + ' 秒');
}, 1000);

// 重開同一顆鏡頭；剛重開過（30 秒內）還是不行，就不再一直重開，請使用者自己關掉重開
function fixCamera(why) {
    if (performance.now() - frozenRestartAt < FROZEN.retryMs) {
        frozenTold = true;
        setPoseStatus('鏡頭畫面停住了，請關閉鏡頭再重新開啟', 'error');
        return;
    }
    frozenRestartAt = performance.now();
    console.warn(why + '，重新開啟鏡頭');
    showAutoNote('鏡頭畫面停住了，自動重新開啟鏡頭');
    startCamera(activeDeviceId(currentStream));
}

// 抓不到鏡頭畫面（不是 AI 的問題）：偶爾一格不用管，連續 10 格就當作鏡頭停住了
// 以前算成 AI 出錯，會重新啟動 AI、最後說「AI 無法使用」，其實要重開的是鏡頭
function frameFailed(err) {
    if (frameFailures === 0) console.warn(err);
    frameFailures++;
    if (frameFailures === MAX_FAILURES && !frozenTold) fixCamera('連續 ' + frameFailures + ' 格抓不到鏡頭畫面');
}

// ---------- 速度建議（js/ai/advisor.js） ----------
// 開鏡頭 3 秒後開始量，畫面裡有人的時間量滿 8 秒給一次建議；錄製中、網頁在背景時不量也不打擾

// 量得準的時候：沒在錄製、網頁在前景、開鏡頭（或換格數、從背景回來）3 秒後
function measuring() {
    return !recorder.recording && !document.hidden && performance.now() - measureFrom >= ADVICE.warmupMs;
}

// 每一格：AI 這格花了幾毫秒（送出畫面到結果回來）
function measureFrame(ms, person) {
    recentMs.push(ms);
    if (recentMs.length > 30) recentMs.shift();
    if (!person) return;
    lastPersonAt = performance.now();
    if (!measuring()) return;
    secondMs.push(ms);
    if (!adviceDone) speedMeter.addFrame(ms);
}

// 每一秒：AI、鏡頭每秒幾格。還沒量完：量滿就給建議（自動時直接調整）；量完之後：自動調每秒格數
function measureSecond() {
    const ms = median(secondMs);
    secondMs.length = 0;
    if (!measuring() || performance.now() - lastPersonAt > 500 || !ms) return;
    if (adviceDone) {
        if (!isAutoFps()) return;
        const rate = autoFps.second({ aiFps: fps.value, cameraFps: cameraFps.value, msPerFrame: ms }, getFrameRate(), cameraMaxFps);
        if (rate === 30) applyAutoRate(30, 'AI 跟不上每秒 60 格，改回 30 格');
        else if (rate === 60) applyAutoRate(60, 'AI 一直很有餘裕，再試每秒 60 格');
        return;
    }
    speedMeter.addSecond(fps.value, cameraFps.value);
    if (!speedMeter.ready) return;
    adviceDone = true;
    const result = speedMeter.result();
    const list = advise({ ...result, chosenFps: getFrameRate(), cameraMax: cameraMaxFps, model: currentModel() });
    console.info('速度量測：', result, list.map(item => item.key).join('、') || '設定剛好');
    // AI 模型選「自動」：用 full 跟不上就改用 lite 並記住（換完重新量，每秒格數等換完再判斷）
    const autoModel = getModelChoice() === 'auto';
    if (autoModel && currentModel() === 'full' && list.some(item => item.key === 'lite')) {
        rememberAutoModel('lite');
        switchPoseModel('lite', '自動調整：AI 用 full 跟不上，改用比較快的 lite');
        return;
    }
    // 每秒格數選「自動」：格數不用問，直接調；只剩模型的建議給使用者決定
    if (isAutoFps()) {
        if (list.some(item => item.key === 'fps60')) applyAutoRate(60, 'AI 還有餘裕，改成每秒 60 格');
        else if (getFrameRate() > 30 && list.some(item => item.action && item.action.fps === 30)) applyAutoRate(30, 'AI 跟不上每秒 60 格，改回 30 格');
    }
    const skipped = loadSkipped();
    // 選了自動的那一項（每秒格數、模型）不用問，只建議其他的
    const advice = list.find(item => !skipped.includes(item.key)
        && !(isAutoFps() && item.action && item.action.fps) && !(autoModel && item.action && item.action.model));
    if (advice) showAdvice(advice);
}

// 自動調每秒格數：直接換鏡頭的格數（不用重開鏡頭），瀏覽器不支援才重開；換完重新暖機、重新累積秒數
async function applyAutoRate(rate, why) {
    const stream = currentStream;
    if (!stream || rate === getFrameRate()) return;
    setAutoRate(rate);
    autoFps.clear();
    measureFrom = performance.now();
    showAutoNote('自動調整：' + why);
    showLimitNote();
    updatePerfInfo();
    try {
        await changeFrameRate(stream, rate);
    } catch (err) {
        console.warn('無法直接換每秒格數，改成重開鏡頭：', err);
        if (stream === currentStream) startCamera(activeDeviceId(stream));
    }
}

// 光線偵測（每秒一次）：太暗時在運算標籤旁邊提醒，亮了就收起來
function checkLight() {
    if (!video.videoWidth) return;
    let luma;
    try {
        lightCtx.drawImage(video, 0, 0, lightCanvas.width, lightCanvas.height);
        luma = averageLuma(lightCtx.getImageData(0, 0, lightCanvas.width, lightCanvas.height).data);
    } catch (err) {
        return;  // 讀不到畫面（極少數瀏覽器）就不判斷
    }
    const dark = lightMeter.update(luma);
    if (lightNote.hidden === dark) lightNote.hidden = !dark;
}
function resetLight() {
    lightMeter.reset();
    lightNote.hidden = true;
}

// 個人校正的說明：站直時膝蓋幾度；手機歪超過 3° 才提（量的是腿，見 js/analysis/calibrate.js 的 phoneTilt）
function calibrationText(b) {
    return '已依你的站姿校正：站直時膝蓋 ' + b.knee + '°' + (Math.abs(b.tilt) >= 3 ? '、手機傾斜約 ' + Math.round(Math.abs(b.tilt)) + '°' : '');
}

// 自動調整時在運算標籤旁邊短暫說明換了什麼（6 秒後收起來）
let autoNoteTimer = null;
function showAutoNote(text) {
    autoNote.textContent = text;
    autoNote.hidden = false;
    clearTimeout(autoNoteTimer);
    autoNoteTimer = setTimeout(() => { autoNote.hidden = true; }, 6000);
}
function hideAutoNote() {
    clearTimeout(autoNoteTimer);
    autoNote.hidden = true;
}

function showAdvice(advice) {
    shownAdvice = advice;
    adviceText.textContent = advice.text;
    adviceYes.hidden = !advice.button;
    adviceYes.textContent = advice.button || '';
    adviceNo.textContent = advice.button ? '不用了' : '知道了';
    adviceBox.hidden = false;
}

function hideAdvice() {
    shownAdvice = null;
    adviceBox.hidden = true;
}

// 重新開始量（開鏡頭、換格數、錄製、切到背景）
function resetSpeedMeter() {
    speedMeter.reset();
    autoFps.reset();
    recentMs.length = 0;
    secondMs.length = 0;
    adviceDone = false;
    measureFrom = performance.now();
    hideAdvice();
}

adviceYes.addEventListener('click', () => {
    const action = shownAdvice && shownAdvice.action;
    hideAdvice();
    if (!action) return;
    if (action.fps) applyFps(action.fps);
    else if (action.model) chooseModel(action.model);
});
adviceNo.addEventListener('click', () => {
    if (shownAdvice) skipAdvice(shownAdvice.key);
    hideAdvice();
});

// 偵測或顯示出錯：偶爾一格出錯不用大動作，連續出錯才重新啟動 AI
function detectFailed(err) {
    // 同樣的錯誤每一格都印，會塞爆主控台、拖慢速度，只印第一次
    if (failures === 0) console.error(err);
    failures++;
    if (failures >= MAX_FAILURES) restartPose('連續 ' + failures + ' 格偵測出錯');
}

// 畫出一格的偵測結果，更新角度、儀表板、提示、錄製與數據面板
// result：{ landmarks（33 點原始比例座標，沒有人時為 null）, world（3D 座標） }；now：這一格送去偵測的時間
function showResult(result, now) {
    // 手機轉向（直拿改橫拿）時鏡頭畫面的寬高會對調，點的座標意義跟著變
    const size = video.videoWidth + 'x' + video.videoHeight;
    if (size !== videoSize) {
        if (videoSize) videoResized();
        videoSize = size;
    }
    // 畫布和影像的長寬比例相同，座標才會對齊
    const dpr = fitOverlay();
    if (fps.tick(now)) {
        checkLight();
        updatePerfInfo();
        measureSecond();
    }
    // landmarks 就是 33 個關鍵點，每點有 x、y、z（0～1 的比例座標）
    // 畫面上用平滑後的點（不抖動）；原始的點保留在 raw，之後分析資料時使用
    const raw = result.landmarks;
    // world：以公尺為單位的 3D 座標（髖部中心為原點），錄製時保存
    const rawWorld = result.world;
    // 平滑 → 擋鬼點 → 角度 → 拍攝方向（js/skeleton/pipeline.js）；沒有人或是鬼骨架時為 null
    const processed = pipeline.process(raw, now, video.videoWidth, video.videoHeight);
    if (processed) {
        const { landmarks, angles } = processed;
        lastSeen = now;
        // 畫出來的位置往前推到「現在」（從送去偵測到現在經過的時間），骨架才不會跟在身體後面
        // 角度、提示、錄製都用沒預測的 landmarks
        const shown = PREDICT
            ? predictPose(landmarks, pipeline.smoother.velocity(), performance.now() - now, video.videoWidth, video.videoHeight)
            : landmarks;
        const shownDerived = shown === landmarks ? processed.derived : getDerivedPoints(shown);
        // 次數、動作錯誤：做錯的部位畫成紅線
        const tracked = tracker.update(processed, now);
        // 個人校正（js/analysis/calibrate.js）：站直不動約 2 秒後，依這個人調整，短暫說明
        if (tracked.calibrated) showAutoNote(calibrationText(tracked.calibrated));
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        drawSkeleton(ctx, shown, shownDerived, dpr, tracked.form.red);
        // 拍攝方向（view）之後做動作判斷時使用，目前顯示在數據面板
        lastPose = { ...processed, raw, rawWorld, shown, shownDerived };
        showPoseLabels();
        hud.update(landmarks, angles);
        // 依拍到的部位提示怎麼站，全身入鏡時顯示綠色「已偵測到全身」
        const hint = framing.update(framingAdvice(landmarks), now);
        // 運動模式：站位沒問題時，換成計算次數的提示（例如正面拍時請側身、伏地挺身請趴下）
        const prompt = showCount(tracked);
        if (prompt && hint.kind === 'ok') showHint(prompt.text, prompt.kind, now);
        else showHint(hint.text, hint.kind, now);
        // 站位沒問題時才顯示動作錯誤（站位不對時先處理站位）
        showForm(hint.kind === 'ok' && !prompt ? tracked.form : null);
    } else {
        // 偵測不到人的頭一小段時間（AI 偶爾漏掉一兩格、某個關節跳一下被擋鬼點擋掉）：保留上一格的骨架，畫面不會閃一下
        // 「未偵測到人體」的提示也和其他提示一樣，要持續一下才換上去，不會突然跳出大橫幅又馬上消失
        if (!lastPose || now - lastSeen > KEEP_POSE_MS) hidePose();
        showCount(tracker.update(null, now));
        showForm(null);
        const hint = framing.update(NO_PERSON, now);
        showHint(hint.text, hint.kind, now);
    }
    // 錄製：原始資料（未平滑、未過濾，模型輸出什麼就記什麼）＋平滑後的點（和畫面上的骨架相同），兩種都存
    // 3D 座標每一格都要處理（平滑需要連續的資料），錄製時才存
    const stableWorld = worldStabilizer.process(rawWorld, now);
    if (recorder.recording && !recorder.add(now, raw, rawWorld, processed ? processed.landmarks : null, stableWorld)) {
        stopRecording(true);
    } else if (recorder.recording && !recWarned && recorder.seconds >= recorder.maxSeconds - WARN_BEFORE_END) {
        recWarned = true;
        showRecNotice('錄製剩 ' + WARN_BEFORE_END + ' 秒', false);
    }
    if (now - lastPanelUpdate > 200) {
        lastPanelUpdate = now;
        if (!dataPanel.hidden) updatePanel();
        if (recorder.recording) showRecordInfo();
    }
}

// 鏡頭畫面大小改變：平滑、提示重新開始，骨架才不會從轉向前的位置滑過來
// 錄製中就自動停止：錄製檔記的是開始時的畫面大小，轉向後的資料混在同一份裡，重播時角度會算錯
function videoResized() {
    pipeline.reset();
    worldStabilizer.reset();
    framing.reset();
    if (recorder.recording) {
        stopRecording();
        recordInfo.textContent += '（畫面方向改變，已自動停止）';
    }
}

// ---------- 運動模式：次數、計時（js/analysis/workouts.js） ----------

let toastTimer = null;

// 每一格顯示次數（棒式顯示秒數）；完成一下時顯示這一下的深度和出現過的錯誤，並唸出次數
// tracked：tracker.update 的結果；回傳要提醒使用者的話 { text, kind }（例如請側身、請趴下），沒有則為 null
function showCount(tracked) {
    const result = tracked.count;
    if (!result) return null;
    let text;
    if (workout.kind === 'hold') {
        text = formatSeconds(result.seconds);
        // 姿勢對、正在計時：數字變綠；姿勢跑掉暫停時恢復白色
        if (hudRepsBox.classList.contains('holding') !== result.holding) hudRepsBox.classList.toggle('holding', result.holding);
        if (result.hold) finishRep(result.hold, 'good', '撐了 ' + Math.floor(result.hold.seconds) + ' 秒');
    } else {
        text = String(result.reps);
        if (result.rep) finishRep(result.rep, result.rep.depth, result.rep.n + ' 下' + (result.rep.depth === 'good' ? '' : '，' + (result.rep.depth === 'close' ? '再低一點' : '太淺了')));
    }
    if (hudReps.textContent !== text) hudReps.textContent = text;
    return result.prompt ? { text: result.prompt, kind: result.promptKind } : null;
}

// 完成一下（或一次棒式）：顯示提示（含這一下出現過的錯誤）、唸出來
// 有錯誤時，深度到位也用黃色（提醒還有地方要改）
function finishRep(rep, depth, speech) {
    const shorts = (rep.errors || []).map(errorShort);
    const kind = shorts.length && depth === 'good' ? 'close' : depth;
    const similar = rep.similarity === null || rep.similarity === undefined ? '' : ' · 相似 ' + rep.similarity + '%';
    showRepToast(workout.toast(rep) + (shorts.length ? ' · ' + shorts.join('、') : '') + similar, kind);
    voice.say(speech);
}

// 動作錯誤：畫面上方紅字（只顯示第一個），新出現的唸出來
// 紅字和每一下的提示在同一個位置：剛做完一下時先讓那一下的提示顯示完（2.5 秒，裡面也寫了這一下的錯誤），之後紅字才回來
// 「新出現」是指這次能顯示時才出現的：錯誤開始時剛好在提示站位（例如請側身），站位好了、紅字出現時才唸
let formShown = new Set();
// 說出原因：這次紅字出現以來最嚴重的數字（每一格都換數字的話會一直跳，站遠看不清楚）
const whyPeak = new Map();
function showForm(formResult) {
    const errors = formResult ? formResult.errors : [];
    errors.forEach(e => { if (!formShown.has(e.id)) voice.say(e.speech, true); });
    formShown = new Set(errors.map(e => e.id));
    for (const id of [...whyPeak.keys()]) if (!formShown.has(id)) whyPeak.delete(id);
    const values = formResult ? formResult.values : {};
    for (const e of errors) if (values[e.id] !== undefined && !(whyPeak.get(e.id) >= values[e.id])) whyPeak.set(e.id, values[e.id]);
    const text = errors.length ? errors[0].text : '';
    const why = errors.length ? whyText(errors[0], whyPeak.get(errors[0].id)) : '';
    if (formTipText.textContent !== text) formTipText.textContent = text;
    if (formWhy.textContent !== why) formWhy.textContent = why;
    formWhy.hidden = !why;
    const hidden = !text || !dataPanel.hidden || !repToast.hidden;
    if (formTip.hidden !== hidden) formTip.hidden = hidden;
}

// kind：'good' 綠、'close' 黃、'shallow' 紅
function showRepToast(text, kind) {
    // 數據面板打開時，大字儀表板也是收起來的（近距離看數字用），提示也不顯示，避免疊在面板上
    if (!dataPanel.hidden) return;
    formTip.hidden = true;
    repToast.textContent = text;
    repToast.className = kind;
    repToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { repToast.hidden = true; }, 2500);
}

function resetCounter() {
    tracker.reset();
    formTip.hidden = true;
    formShown.clear();
    voice.stop();
    hudReps.textContent = workout.kind === 'hold' ? '0:00' : '0';
    hudRepsBox.classList.remove('holding');
    clearTimeout(toastTimer);
    repToast.hidden = true;
}

// 鏡頭中斷（重開鏡頭）：進行中的這一下作廢、提示收起來，已經做完的次數保留
function interruptCounter() {
    tracker.interrupt();
    formTip.hidden = true;
    formShown.clear();
    voice.stop();
    clearTimeout(toastTimer);
    repToast.hidden = true;
}

// ---------- 運動總結（js/analysis/session.js） ----------

// 一次運動結束（關鏡頭、換動作、關網頁）：存成紀錄，首頁顯示這次的總結和上一次比較
function finishSession() {
    // 棒式撐到一半就結束：撐到現在的算一次
    if (workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
    const s = summarize(workout.id, tracker.items, sessionStart, Date.now());
    sessionStart = Date.now();
    resetCounter();
    if (!s) return;
    const previous = saveSession(s);
    showSummary(s, previous);
    // 打開了雲端同步：這一筆存一份到雲端（沒有網路時先存在這台裝置，之後自動補傳）
    cloud.sync(loadHistory());
    // 還沒打開、也還沒問過：在總結下面問一次要不要打開（js/ui/cloud-ask.js）
    cloudAsk.hidden = !shouldAskCloud({ available: cloud.available, enabled: cloud.enabled, hasSummary: true, asked: cloudAsked });
}

function showSummary(s, previous) {
    const lines = [...describe(s), ...compare(s, previous)];
    summaryLines.replaceChildren(...lines.map(text => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
    }));
    summaryBox.hidden = false;
    showHistory();
}

// 最近 10 次的紀錄（新的在上面）
function showHistory() {
    const list = loadHistory();
    historyBox.hidden = !list.length;
    historyBox.querySelector('summary').textContent = '運動紀錄（' + list.length + ' 次，存在這台裝置上）';
    historyList.replaceChildren(...list.slice(-10).reverse().map(s => {
        const li = document.createElement('li');
        const d = new Date(s.date);
        li.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + ' · ' + describe(s)[0];
        return li;
    }));
}
document.getElementById('clearHistory').addEventListener('click', () => {
    clearHistory();
    summaryBox.hidden = true;
    showHistory();
});
// ---------- 驗證實驗：記下角度（js/analysis/validate.js） ----------
// 擺好姿勢不動時按，記下現在的關節角度；預設比對看得比較清楚那一側的主要關節（深蹲是膝蓋、伏地挺身是手肘）
const snapInfo = document.getElementById('snapInfo');
function showSnapCount(text) {
    const n = loadSnapshots().length;
    snapInfo.textContent = text || (n ? '已記 ' + n + ' 筆，到使用說明「驗證實驗」和量角器比對' : '');
}
document.getElementById('snapBtn').addEventListener('click', () => {
    if (!lastPose) {
        showSnapCount('還沒偵測到人，站進畫面再按');
        return;
    }
    const side = clearerSide(lastPose.landmarks);
    const n = addSnapshot(makeSnapshot(lastPose, workout.id, side + '_' + workout.hud[0]));
    const joint = (side === 'LEFT' ? '左' : '右') + { KNEE: '膝', HIP: '髖', ELBOW: '肘' }[workout.hud[0]];
    const angle = lastPose.angles[side + '_' + workout.hud[0]];
    showSnapCount('第 ' + n + ' 筆：' + joint + ' ' + (angle === null ? '—' : Math.round(angle) + '°') + '（到使用說明「驗證實驗」和量角器比對）');
});
showSnapCount();

// 直接關網頁、切走（手機把網頁收起來）也把這次記下來
// 棒式撐到一半（還沒有做完的一次）也要記：finishSession 會把撐到現在的算一次
window.addEventListener('pagehide', () => {
    if (tracker.items.length || (workout.kind === 'hold' && tracker.counter.current)) finishSession();
});
showHistory();

// 換了運動模式：大字儀表板、骨架旁的角度、次數框、首頁的說明一起換
function showWorkout() {
    hud.setJoints(workout.hud);
    shownAngleKeys = workout.labels.flatMap(joint => ['LEFT_' + joint, 'RIGHT_' + joint]);
    hudRepsBox.hidden = !tracker.counter;
    hudRepsBox.classList.toggle('time', workout.kind === 'hold');
    hudRepsName.textContent = workout.name;
    hudRoot.classList.toggle('lab', !!tracker.counter);
    resetCounter();
    showPoseLabels();
}
onWorkoutChange(next => {
    finishSession();
    workout = next;
    tracker = new WorkoutTracker(next.id);
    showWorkout();
});

// 顯示標籤：關節角度一直顯示；「顯示編號」開啟時標出主要關節；使用者點選的點另外顯示 3 秒
function showPoseLabels() {
    if (!lastPose) return;
    if (picked && performance.now() > picked.until) picked = null;
    const rect = videoRect(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight);
    updateLabels(labelLayer, lastPose.shown, lastPose.shownDerived, rect, video.classList.contains('mirrored'),
        showLabels, picked ? picked.id : null, shownAngles());
}

// 要一直顯示的關節角度
function shownAngles() {
    const angles = {};
    for (const key of shownAngleKeys) angles[key] = lastPose.angles[key];
    return angles;
}

// 點畫面上任何一個點（包括臉、手指），顯示它的編號與名稱
function pickPoint(event) {
    if (!lastPose || event.target.closest('#toolbar, #infobar, #dataPanel')) return;
    const bounds = stage.getBoundingClientRect();
    const rect = videoRect(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight);
    const id = nearestPoint(event.clientX - bounds.left, event.clientY - bounds.top,
        lastPose.shown, lastPose.shownDerived, rect, video.classList.contains('mirrored'), 40);
    picked = id === null ? null : { id, until: performance.now() + 3000 };
    showPoseLabels();
}

// ---------- 鏡頭 ----------

// 開啟鏡頭並切換到全畫面；沒指定 deviceId 時使用裝置預設鏡頭
async function startCamera(deviceId) {
    const request = ++cameraRequest;
    stopStream();
    // 第一次使用時瀏覽器會先問要不要允許相機，這段時間首頁要有回應，不要還寫著「尚未開啟鏡頭」
    if (stage.hidden) statusText.textContent = '正在開啟鏡頭…（第一次使用請按「允許」使用相機）';
    let stream;
    try {
        stream = await openCamera(deviceId);
    } catch (err) {
        if (request !== cameraRequest) return;
        // 之前選的鏡頭已經不在了（例如外接鏡頭被拔掉）：改用裝置預設鏡頭
        if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
            cameraSelect.innerHTML = '';
            return startCamera();
        }
        closeCamera();
        statusText.textContent = cameraErrorMessage(err);
        return;
    }
    // 等待鏡頭的期間，使用者已經又切換或關閉鏡頭：這個舊的鏡頭直接關掉
    if (request !== cameraRequest) {
        stopCamera(stream);
        return;
    }
    currentStream = stream;
    video.srcObject = stream;
    if (!tracker.items.length) sessionStart = Date.now();
    measureFrom = performance.now();
    resetFrozenWatch();
    // 保險起見主動播放（iPhone 省電模式可能擋掉自動播放，畫面會停在第一格）
    video.play().catch(() => {});
    statusText.textContent = '鏡頭已開啟';
    showStage(true);
    hudRoot.hidden = !dataPanel.hidden;
    const mirror = shouldMirror(stream);
    video.classList.toggle('mirrored', mirror);
    overlay.classList.toggle('mirrored', mirror);
    hud.setMirrored(mirror);
    // 這顆鏡頭最多每秒幾格：做不到的選項變灰；檔案大小跟著鏡頭的每秒格數估算
    cameraMaxFps = maxFrameRate(stream);
    showFpsChoice();
    showLimitNote();
    // 鏡頭中途斷線（外接鏡頭被拔掉、被其他程式搶走）：回到首頁並說明原因
    stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (stream !== currentStream) return;
        closeCamera();
        statusText.textContent = '鏡頭連線中斷（可能被拔除或被其他程式使用），請重新開啟鏡頭';
    });
    // 上次 AI 壞掉沒救回來：重新開啟鏡頭時再試一次
    if (poseBroken) {
        poseBroken = false;
        lastRestart = -Infinity;
        restartPose('重新開啟鏡頭');
    }
    detectPose();
    updatePerfInfo();
    // 運動時手機不會因為沒碰螢幕而變暗、鎖定
    keepScreenOn(updatePerfInfo);
    try {
        await fillCameraSelect();
    } catch (err) {
        console.warn('無法列出鏡頭清單，不影響使用：', err);
    }
}

// 只停止鏡頭串流（切換鏡頭時使用，畫面維持全螢幕）
// 錄製中也一併停止：換了鏡頭，解析度與角度都不同，不能接在同一份資料裡
function stopStream() {
    cancelCountdown();
    hideRecNotice();
    if (recorder.recording) stopRecording();
    if (currentStream) {
        stopCamera(currentStream);
        currentStream = null;
    }
    video.srcObject = null;
    cancelDetect();
    streamGeneration++;
    waitingFrame = null;
    fps.reset();
    cameraFps.reset();
    lastCameraFrame = null;
    resetSpeedMeter();
    resetLight();
    pipeline.reset();
    worldStabilizer.reset();
    framing.reset();
    framingSound.reset();
    interruptCounter();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    lastVideoTime = -1;
    videoSize = '';
    lastPose = null;
    picked = null;
    hideLabels();
    hud.reset();
    // 清掉上一次的偵測狀態（綠色「已偵測到全身」或大字提示），等新的畫面進來再更新；AI 還在載入時保留載入進度文字
    setPoseStatus(pose ? '等待鏡頭畫面…' : poseStatus.textContent);
}

// 切換鏡頭畫面與首頁
// 鏡頭畫面蓋住首頁時，首頁的按鈕設為 inert（不能點、鍵盤 Tab 也不會跳過去），
// 鍵盤焦點移到「關閉鏡頭」；回到首頁時焦點回到「開啟鏡頭」
const page = document.querySelector('.page');
const siteNav = document.querySelector('.site-nav');
function showStage(on) {
    if (stage.hidden !== on) return;
    stage.hidden = !on;
    page.inert = on;
    if (siteNav) siteNav.inert = on;
    const focused = document.activeElement;
    if (on && (focused === startBtn || focused === document.body)) stopBtn.focus();
    if (!on && (stage.contains(focused) || focused === document.body)) startBtn.focus();
}

// 關閉鏡頭並回到首頁
function closeCamera() {
    cameraRequest++;
    stopStream();
    finishSession();
    hideAutoNote();
    allowScreenOff();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showStage(false);
    statusText.textContent = '鏡頭已關閉';
}

// 把所有鏡頭放進下拉選單，並選到目前使用的那一顆；只有一顆鏡頭時沒得選，隱藏選單
async function fillCameraSelect() {
    const cameras = await listCameras();
    const activeId = currentStream ? activeDeviceId(currentStream) : '';
    cameraSelect.innerHTML = '';
    cameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label;
        if (camera.deviceId === activeId) option.selected = true;
        cameraSelect.appendChild(option);
    });
    cameraSelect.hidden = cameras.length <= 1;
}

// ---------- 數據面板與錄製 ----------

// 錄製中時按鈕加上紅點提醒（面板收起來也看得到）
function updateDataBtn() {
    setBtnText(dataBtn, dataPanel.hidden ? '' : '隱藏', '數據' + (recorder.recording ? ' ●' : ''));
    dataBtn.setAttribute('aria-pressed', String(!dataPanel.hidden));
}

// 錄製中顯示「已錄／上限」，人走回來看一眼就知道還剩多久
function showRecordInfo() {
    recordInfo.textContent = recorder.recording
        ? '錄製中 ' + clock(recorder.seconds) + '／' + clock(recorder.maxSeconds) + ' · ' + recorder.frameCount + ' 格'
        : '已錄 ' + clock(recorder.seconds) + ' · ' + recorder.frameCount + ' 格'
            + (recLimitHit ? '（已錄滿 ' + recorder.maxSeconds / 60 + ' 分鐘，自動停止）' : '');
}

// 秒數 → 「4:05」（四捨五入：錄滿時最後一格約 299.97 秒，顯示 5:00）
function clock(seconds) {
    const s = Math.round(seconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ---------- 錄製快結束、錄滿時的提醒 ----------
// 錄製上限是使用者選的 5～20 分鐘（下面的「錄製上限」）。以前錄滿只有數據面板的小字改變，
// 人在 2～3 公尺外運動時看不到也聽不到，後面的動作沒錄到也不知道（真實錄影：棒式、伏地挺身被截掉）
// 所以剩 30 秒、錄滿時都在畫面中間顯示大字並嗶一聲，和錄製前倒數一樣站遠也知道
const WARN_BEFORE_END = 30;
let recWarned = false;     // 這次錄製已經提醒過「剩 30 秒」
let recLimitHit = false;   // 這次錄製是錄滿自動停止的
let recNoticeTimer = 0;

function showRecNotice(text, final) {
    clearTimeout(recNoticeTimer);
    recNoticeEl.textContent = text;
    recNoticeEl.classList.toggle('final', final);
    recNoticeEl.hidden = false;
    beep(final);
    recNoticeTimer = setTimeout(hideRecNotice, final ? 6000 : 3000);
}

function hideRecNotice() {
    clearTimeout(recNoticeTimer);
    recNoticeEl.hidden = true;
}

// ---------- 錄製前倒數 ----------
// 一個人錄的時候，按下錄製還要走到 2～3 公尺外、轉成側面；倒數讓開頭不會都是走路的畫面
// 每一秒嗶一聲（站遠看不到畫面也知道），最後一聲比較長、比較高，代表開始錄

let countdown = null;   // 倒數中：{ timer, end }

try {
    const saved = localStorage.getItem('recordCountdown');
    if (saved !== null && [...countdownSelect.options].some(o => o.value === saved)) countdownSelect.value = saved;
} catch (err) { /* 不能存就用預設 */ }
countdownSelect.addEventListener('change', () => {
    try { localStorage.setItem('recordCountdown', countdownSelect.value); } catch (err) { /* 不能存就不記 */ }
});

// ---------- 錄製上限 ----------
// 以前固定 5 分鐘；老師 10/12 回饋改成可以選 5、10、15、20 分鐘（會記住選擇）
// 旁邊顯示檔案大約多大；手機選 15、20 分鐘時提醒：錄製中的資料都放在記憶體裡（20 分鐘約 165 MB），
// 手機的瀏覽器記憶體不夠時會直接重新整理網頁，整段就不見了。只提醒、不禁止（有些手機記憶體夠）
const PHONE = ['iOS', 'iPadOS', 'Android'].includes(describeDevice().os);
const PHONE_WARN_MINUTES = 15;

try {
    const saved = localStorage.getItem('recordLimit');
    if (saved !== null && LIMIT_MINUTES.includes(Number(saved))) limitSelect.value = saved;
} catch (err) { /* 不能存就用預設 */ }
limitSelect.addEventListener('change', () => {
    try { localStorage.setItem('recordLimit', limitSelect.value); } catch (err) { /* 不能存就不記 */ }
    showLimitNote();
});

function limitMinutes() {
    return Number(limitSelect.value) || MAX_SECONDS / 60;
}

function showLimitNote() {
    const minutes = limitMinutes();
    // 鏡頭每秒格數比 30 多（使用者選了 60 格以上），檔案和記憶體跟著變大，提醒的門檻跟著提早
    // 用鏡頭實際設定的格數估算（選 60 但鏡頭只給 30，就照 30 算）；還沒開鏡頭時用選的格數
    const rate = (currentStream && cameraFrameRate(currentStream)) || getFrameRate();
    const load = minutes * Math.max(1, rate / 30);
    // 四捨五入到 5 MB：只是大概，實際大小看每秒幾格、有沒有偵測到人
    const mb = Math.round(load * JSON_MB_PER_MINUTE / 5) * 5;
    const warn = PHONE && load >= PHONE_WARN_MINUTES;
    limitNote.textContent = '檔案約 ' + mb + ' MB'
        + (warn ? '。手機錄太久，瀏覽器可能記憶體不夠而重新整理，錄的資料會不見；建議用電腦，或分成幾段錄' : '');
    limitNote.classList.toggle('warn', warn);
    // 錄製中不顯示（數據面板那一列留給「錄製中 0:12／10:00」）
    limitNote.hidden = recorder.recording;
}
showLimitNote();

// ---------- 每秒格數 ----------
// 老師 10/12：每秒 30 格感覺很低。讓使用者依自己手機的能力選 30、60、90、120（js/platform/camera.js 會記住）
// 首頁「畫面流暢度」和鏡頭畫面（點開運算標籤）兩個選單都能選；開著鏡頭時換了就用新的格數重開同一顆鏡頭
// 鏡頭有回報上限時，做不到的選項變灰（例如「每秒 120 格（鏡頭最多 60）」）；
// 沒回報（舊的 Safari）就都能選，做不到時鏡頭自動用做得到的，運算標籤會顯示實際每秒幾格
let cameraMaxFps = 0;   // 最近開的鏡頭最多每秒幾格（0：不知道）

function fillFpsOptions(select) {
    const current = getFpsChoice();
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = '自動（30～60 格，實驗）';
    select.replaceChildren(...FPS_CHOICES.map(rate => {
        const option = document.createElement('option');
        const over = rate > 30 && cameraMaxFps > 0 && rate > cameraMaxFps;
        option.value = String(rate);
        option.textContent = '每秒 ' + rate + ' 格' + (rate === 30 ? '（建議）' : over ? '（鏡頭最多 ' + cameraMaxFps + '）' : '（實驗）');
        // 目前選的不鎖住（不然選單會顯示空白），只寫出鏡頭最多幾格
        option.disabled = over && rate !== current;
        return option;
    }), auto);
    select.value = String(current);
}

function showFpsChoice() {
    fillFpsOptions(fpsSelect);
    fillFpsOptions(fpsLive);
    showAdvancedTitle();
    // 有選項變灰時說明原因（同學 10/13 用筆電測：只看到選不了，以為選單卡死）
    const capped = cameraMaxFps > 0 && FPS_CHOICES.some(rate => rate > 30 && rate > cameraMaxFps);
    const capNote = '這顆鏡頭最多每秒 ' + cameraMaxFps + ' 格，所以灰色的選不了；'
        + '要更多格需要支援的手機或外接鏡頭（換鏡頭後會重新判斷）';
    const choice = getFpsChoice();
    fpsHint.hidden = choice === 30 && !capped;
    fpsHint.textContent = choice === 'auto'
        ? '實驗中：開鏡頭、站進畫面後，網站會依 AI 實際的速度在每秒 30～60 格之間自動調整（錄製中不會變）。'
            + '開鏡頭後點運算標籤，可以看目前幾格' + (capped ? '。' + capNote : '')
        : choice > 30
        ? '實驗中：要鏡頭支援、AI 算得夠快，手機會比較耗電、發燙；做不到時會自動用做得到的。'
            + '開鏡頭後點運算標籤，可以看實際每秒幾格，也可以直接切換' + (capped ? '。' + capNote : '')
        : capNote;
}

function chooseFps(select) {
    applyFps(select.value === 'auto' ? 'auto' : Number(select.value));
}
function applyFps(rate) {
    setFrameRate(rate);
    showFpsChoice();
    showLimitNote();
    updatePerfInfo();
    // 開著鏡頭：用新的每秒格數重開同一顆鏡頭（錄製中選單會鎖住，不會走到這裡）
    if (currentStream) startCamera(activeDeviceId(currentStream));
}
fpsSelect.addEventListener('change', () => chooseFps(fpsSelect));
fpsLive.addEventListener('change', () => chooseFps(fpsLive));
showFpsChoice();

// ---------- 進階設定（首頁收起來的一列：畫面流暢度、AI 模型） ----------
// 預設（每秒 30 格、lite 模型）最穩，一般不用改；改過的設定寫在標題上（例如「進階設定（每秒 60 格、full 模型）」），收起來也知道現在用什麼
function showAdvancedTitle() {
    const changed = [];
    const fpsChoice = getFpsChoice();
    if (fpsChoice === 'auto') changed.push('每秒格數自動');
    else if (fpsChoice !== 30) changed.push('每秒 ' + fpsChoice + ' 格');
    const model = getModelChoice();
    if (model !== 'lite') changed.push(model === 'auto' ? 'AI 模型自動' : model + ' 模型');
    advancedTitle.textContent = '進階設定（' + (changed.length ? changed.join('、') : '畫面流暢度、AI 模型，一般不用改') + '）';
}

// ---------- 首頁的常用開關：語音提醒、雲端同步（10/19 從進階設定拿出來） ----------
voiceToggle.checked = voice.enabled;
voiceToggle.disabled = !voice.supported;
voiceToggle.addEventListener('change', () => voice.setEnabled(voiceToggle.checked));

// ---------- 雲端同步（js/cloud/cloud.js） ----------
// 預設關閉；打開時把這台裝置的運動紀錄傳上去，之後每次運動完自動上傳；網站還沒接上 Firebase 時整段不出現
const cloudBox = document.getElementById('cloudBox');
const cloudToggle = document.getElementById('cloudToggle');
const cloudStatus = document.getElementById('cloudStatus');
const cloudDelete = document.getElementById('cloudDelete');
cloudBox.hidden = !cloud.available;
cloudToggle.checked = cloud.enabled;
cloud.onStatus(s => {
    cloudStatus.textContent = s.text;
    cloudStatus.dataset.state = s.state;
    cloudDelete.hidden = !cloud.hasData || s.state === 'working';
});
// 自己開、關過：之後運動完不用再問
function answerCloudAsk() {
    cloudAsked = true;
    saveAsked();
    cloudAsk.hidden = true;
}
cloudToggle.addEventListener('change', () => {
    cloud.setEnabled(cloudToggle.checked, loadHistory());
    answerCloudAsk();
});
// 運動完的詢問：「打開」和直接打開開關一樣；「不用了」之後不再問（開關還在首頁上，隨時可以打開）
document.getElementById('cloudAskYes').addEventListener('click', () => {
    cloudToggle.checked = true;
    cloud.setEnabled(true, loadHistory());
    answerCloudAsk();
    cloudToggle.focus();
});
document.getElementById('cloudAskNo').addEventListener('click', answerCloudAsk);
// 刪除雲端上這台裝置的紀錄（這台裝置上的不動），同時關閉同步
cloudDelete.addEventListener('click', async () => {
    if (!confirm('確定要刪除雲端上這台裝置的運動紀錄嗎？這台裝置上的紀錄不會被刪掉，雲端同步也會關閉。')) return;
    cloudToggle.checked = false;
    cloudToggle.disabled = true;
    await cloud.deleteAll();
    cloudToggle.disabled = false;
});
// 網路恢復、打開網頁時：補傳還沒上傳的
window.addEventListener('online', () => cloud.sync(loadHistory()));
cloud.sync(loadHistory());

// ---------- AI 模型（自動調整的第 3 步） ----------
// 首頁「AI 模型」和鏡頭畫面（點開運算標籤）兩個選單都能選：lite、full 或自動（js/ai/model-choice.js 會記住）
// 換模型不用重新載入網頁：先下載新的模型檔（下載過的有存，很快），再重新建立偵測器，畫面停 1～2 秒
const MODEL_TEXT = { lite: 'lite（較快，建議）', full: 'full（較準、較慢）', auto: '自動（先用 full，太慢改 lite，實驗）' };
let switchingModel = false;   // 正在換模型

// 現在用的模型（AI 還沒載入時是要載入的那個）
function currentModel() {
    return pose ? pose.model : modelToLoad();
}
function modelLabel() {
    return (getModelChoice() === 'auto' ? '自動：' : '') + currentModel() + ' 模型';
}

function fillModelOptions(select) {
    select.replaceChildren(...MODEL_CHOICES.map(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = MODEL_TEXT[key];
        return option;
    }));
    select.value = getModelChoice();
}

function showModelChoice() {
    fillModelOptions(modelSelect);
    fillModelOptions(modelLive);
    showAdvancedTitle();
    modelSelect.disabled = switchingModel;
    modelLive.disabled = switchingModel || recorder.recording;
    const choice = getModelChoice();
    modelPickHint.hidden = choice === 'lite';
    modelPickHint.textContent = choice === 'full'
        ? '比較準、鬼點比較少，但運算約慢 1.5 倍、第一次多下載 3.6 MB；開鏡頭後點運算標籤可以看 AI 每格幾毫秒'
        : autoRemembered()
        ? '自動：這台裝置之前量到 full 跟不上，所以用 lite（再選一次「自動」會重新判斷）'
        : '實驗中：先用比較準的 full；開鏡頭、站進畫面後量到這台裝置跟不上，會自動改用 lite 並記住';
    modelHint.textContent = '第一次使用需下載約 ' + Math.round((11.8e6 + MODELS[modelToLoad()].size) / 1e6) + ' MB，之後開啟會快很多';
}

function chooseModel(value) {
    setModelChoice(value);
    // 網址的 ?model= 只在這次有效：使用者自己選了之後拿掉，重新整理才不會又換回去
    const url = new URL(location.href);
    if (url.searchParams.has('model')) {
        url.searchParams.delete('model');
        history.replaceState(null, '', url.href);
    }
    showModelChoice();
    updatePerfInfo();
    checkModel();
}
modelSelect.addEventListener('change', () => chooseModel(modelSelect.value));
modelLive.addEventListener('change', () => chooseModel(modelLive.value));

// 選的模型和正在用的不一樣：換（AI 還在載入、重新啟動或正在換時，等它好了再換）
function checkModel() {
    if (!pose || switchingModel || restarting || poseBroken) return;
    if (pose.model !== modelToLoad()) switchPoseModel(modelToLoad(), '');
}

// 換模型：note 是自動調整時要短暫顯示的說明
async function switchPoseModel(key, note) {
    if (!pose || switchingModel || restarting) return;
    switchingModel = true;
    restarting = true;
    streamGeneration++;
    clearPose();
    resetSpeedMeter();
    showModelChoice();
    if (note) showAutoNote(note);
    const from = pose.model;
    setModelStatus('換成 ' + key + ' 模型中…');
    try {
        await pose.useModel(key, fraction => setModelStatus('換成 ' + key + ' 模型：下載 ' + Math.round(fraction * 100) + '%'));
        setModelStatus('AI 模型已就緒（' + key + ' 模型）');
    } catch (err) {
        console.error(err);
        if (!err.recovered) {
            switchingModel = false;
            showModelChoice();
            giveUpPose();
            return;
        }
        setModelStatus('換成 ' + key + ' 模型失敗，繼續用 ' + from + '（請檢查網路）');
    }
    failures = 0;
    pipeline.reset();
    resetSpeedMeter();
    restarting = false;
    switchingModel = false;
    showModelChoice();
    updatePerfInfo();
}
showModelChoice();

// 短促的嗶聲（倒數每秒一聲、開始錄製和錄滿是長音）；跟著工具列的音量，沒有聲音（瀏覽器不支援、手機靜音）也不影響倒數
function beep(long) {
    sound.play(long ? 'long' : 'count');
}

function startCountdown() {
    const seconds = Number(countdownSelect.value) || 0;
    if (!seconds) {
        startRecording();
        return;
    }
    countdown = { end: performance.now() + seconds * 1000, timer: 0, shown: 0 };
    recordBtn.classList.add('counting');
    countdownSelect.disabled = true;
    tickCountdown();
}

// 用「結束時間」算剩幾秒，不是每秒減 1：手機忙的時候計時器會晚到，累積起來會越倒越慢
function tickCountdown() {
    const left = Math.ceil((countdown.end - performance.now()) / 1000);
    if (left <= 0) {
        cancelCountdown();
        beep(true);
        startRecording();
        // 「開始」短暫顯示一下，站遠的人知道已經在錄了
        countdownEl.textContent = '開始';
        countdownEl.classList.add('go');
        countdownEl.hidden = false;
        countdown = { timer: setTimeout(hideCountdown, 800), go: true };
        return;
    }
    if (left !== countdown.shown) {
        countdown.shown = left;
        countdownEl.textContent = String(left);
        countdownEl.classList.remove('go');
        countdownEl.hidden = false;
        recordBtn.textContent = '✕ 取消倒數（' + left + '）';
        beep(false);
    }
    countdown.timer = setTimeout(tickCountdown, 100);
}

function hideCountdown() {
    countdownEl.hidden = true;
    countdownEl.classList.remove('go');
    if (countdown && countdown.go) countdown = null;
}

// 取消倒數（按取消、關鏡頭、換鏡頭）；已經開始錄的「開始」字樣也一起收掉
function cancelCountdown() {
    if (!countdown) return;
    clearTimeout(countdown.timer);
    const counting = !countdown.go;
    countdown = null;
    hideCountdown();
    if (counting) {
        recordBtn.classList.remove('counting');
        countdownSelect.disabled = false;
        recordBtn.textContent = recorder.frameCount ? '● 重新錄製' : '● 開始錄製';
    }
}

function startRecording() {
    recWarned = false;
    recLimitHit = false;
    hideRecNotice();
    recorder.start({
        app: 'AI 智慧運動分析系統',
        model: MODELS[currentModel()].name,
        // 使用者選的模型：'lite'、'full' 或 'auto'（自動；錄製中不會換）
        modelChoice: getModelChoice(),
        computeMode: pose ? pose.computeMode : '',
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        // 鏡頭設定的每秒格數（選了 60 格以上時，看鏡頭到底有沒有給那麼多格）
        cameraFrameRate: cameraFrameRate(currentStream),
        // 選的運動模式：'free'（自由）、'squat'、'pushup'、'plank'、'lunge'
        workout: workout.id,
        // 個人校正：站直時的膝蓋角度、上身和畫面垂直線的夾角（還沒校正時是 null）
        calibration: tracker.baseline,
        // 使用者選的每秒格數：30、60、90、120 或 'auto'（自動；錄製中不會變）
        fpsChoice: getFpsChoice(),
        // AI 每格算幾毫秒（開始錄製前最近 30 格的中位數）：比較不同手機的速度
        aiMsPerFrame: recentMs.length ? Math.round(median(recentMs)) : null,
        // 畫面只是顯示時鏡像；錄下的座標一律是鏡頭原始畫面（未鏡像）
        displayMirrored: video.classList.contains('mirrored'),
        userAgent: navigator.userAgent
    }, limitMinutes() * 60);
    // 錄製中不能改上限（改了也不知道算新的還是舊的）、不能換每秒格數（要重開鏡頭，錄製會中斷）、不能換動作
    limitSelect.disabled = true;
    setWorkoutLocked(true);
    fpsLive.disabled = modelLive.disabled = true;
    showLimitNote();
    // 錄製中不跳建議；還沒量完的，停止錄製後重新量
    if (!adviceDone) speedMeter.reset();
    hideAdvice();
    hideAutoNote();
    recordBtn.textContent = '■ 停止錄製';
    recordBtn.classList.add('recording');
    updateDataBtn();
    csvBtn.hidden = true;
    jsonBtn.hidden = true;
    showRecordInfo();
}

// limitHit：錄滿上限自動停止（其他情況：按停止、關鏡頭、換鏡頭、畫面轉向）
function stopRecording(limitHit = false) {
    recorder.stop();
    setWorkoutLocked(false);
    recLimitHit = limitHit;
    if (limitHit) showRecNotice('已錄滿 ' + recorder.maxSeconds / 60 + ' 分鐘，自動停止', true);
    limitSelect.disabled = false;
    fpsLive.disabled = false;
    modelLive.disabled = switchingModel;
    showLimitNote();
    recordBtn.textContent = '● 重新錄製';
    recordBtn.classList.remove('recording');
    updateDataBtn();
    showRecordInfo();
    csvBtn.hidden = jsonBtn.hidden = recorder.frameCount === 0;
}

// 數據面板：數值表格（原始或平滑後），以及動作判斷用的資訊
function updatePanel() {
    updateDataPanel(dataRows, lastPose && (panelSmooth ? lastPose.landmarks : lastPose.raw));
    updateViewInfo(viewInfo, lastPose, video.classList.contains('mirrored'), video.videoWidth, video.videoHeight);
}

// 數據面板是近距離分析用的，打開時收起大字儀表板，兩者不會疊在一起
function toggleDataPanel() {
    dataPanel.hidden = !dataPanel.hidden;
    hudRoot.hidden = !dataPanel.hidden;
    if (!dataPanel.hidden) repToast.hidden = true;
    updateDataBtn();
    if (!dataPanel.hidden) updatePanel();
}

// ---------- 按鈕 ----------

// 全螢幕會連瀏覽器網址列一起隱藏；瀏覽器規定必須由使用者按鈕觸發
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else {
        stage.requestFullscreen().catch(err => console.warn('無法進入全螢幕：', err));
    }
}

// 工具列按鈕：只換文字，保留前面的圖示
// 按鈕文字：verb（顯示、隱藏、離開）＋ noun（編號、數據、全螢幕）
// 手機上只顯示 noun（style.css 的 .btn-verb），多了音量按鈕後工具列一行才放得下；開啟中的按鈕有綠色外框（aria-pressed）
function setBtnText(button, verb, noun) {
    const span = button.querySelector('.btn-text');
    if (span.textContent === verb + noun) return;
    span.replaceChildren();
    if (verb) {
        const v = document.createElement('span');
        v.className = 'btn-verb';
        v.textContent = verb;
        span.append(v);
    }
    span.append(noun);
}

function updateLabelBtn() {
    setBtnText(labelBtn, showLabels ? '隱藏' : '顯示', '編號');
    labelBtn.setAttribute('aria-pressed', String(showLabels));
}

// 按「開啟鏡頭」的當下喚醒聲音：瀏覽器規定要使用者按過按鈕才能出聲，之後的提示音才響得出來
startBtn.addEventListener('click', () => {
    sound.unlock();
    voice.unlock();
    startCamera(cameraSelect.value);
});
stopBtn.addEventListener('click', closeCamera);
cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
fullscreenBtn.addEventListener('click', toggleFullscreen);
// 切到別的 App 再回來時，瀏覽器會自動解除螢幕常亮，這裡重新開啟
// iPhone 切回來時影像可能停在最後一格，主動繼續播放
document.addEventListener('visibilitychange', () => {
    // 切到背景時 AI 會停下來，回來後的頭幾秒不準：還沒量完的重新量
    if (document.hidden && !adviceDone) speedMeter.reset();
    if (document.visibilityState !== 'visible' || !currentStream) return;
    measureFrom = performance.now();
    resetFrozenWatch();
    autoFps.clear();
    keepScreenOn(updatePerfInfo);
    if (video.paused) video.play().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    setBtnText(fullscreenBtn, on ? '離開' : '', '全螢幕');
    fullscreenBtn.setAttribute('aria-pressed', String(on));
});
labelBtn.addEventListener('click', () => {
    showLabels = !showLabels;
    saveLabelSetting(showLabels);
    updateLabelBtn();
    showPoseLabels();
});
stage.addEventListener('click', pickPoint);
dataBtn.addEventListener('click', toggleDataPanel);
// 音量：點一下換一段（關 → 小 → 中 → 大），試聽一聲；人站遠時手機上的拉桿很難拉準，所以分四段
// 圖示：喇叭旁邊的聲波 0～3 條，「關」是一個叉
const SOUND_WAVES = { off: 'M16 9l5 6M21 9l-5 6', low: 'M15.5 10a3 3 0 0 1 0 4', mid: 'M15.5 10a3 3 0 0 1 0 4M18 7.5a6.5 6.5 0 0 1 0 9', high: 'M15.5 10a3 3 0 0 1 0 4M18 7.5a6.5 6.5 0 0 1 0 9M20.5 5a10 10 0 0 1 0 14' };
function updateSoundBtn() {
    const name = LEVEL_NAMES[sound.level];
    const level = soundBtn.querySelector('.sound-level');
    if (level.textContent !== name) level.textContent = name;
    soundBtn.querySelector('.sound-waves').setAttribute('d', SOUND_WAVES[sound.level]);
    soundBtn.setAttribute('aria-label', '提示音音量：' + name + '（點一下切換）');
    soundBtn.classList.toggle('muted', sound.level === 'off');
}
soundBtn.addEventListener('click', () => {
    sound.next();
    updateSoundBtn();
});
updateSoundBtn();
// 數據面板的表格可以收合，只留錄製列；選擇會記在瀏覽器裡
const PANEL_KEY = 'panelCollapsed';
function setPanelCollapsed(collapsed) {
    panelBody.hidden = collapsed;
    dataPanel.classList.toggle('collapsed', collapsed);
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.textContent = collapsed ? '展開表格' : '收合表格';
    try {
        localStorage.setItem(PANEL_KEY, collapsed ? '1' : '0');
    } catch (err) {
        // 無法儲存也不影響使用
    }
}
panelToggle.addEventListener('click', () => setPanelCollapsed(!panelBody.hidden));
// 表格的數字：原始（AI 直接輸出，驗證實驗用）或平滑後（和畫面上的骨架相同，比較不會跳）；選擇會記在瀏覽器裡
// 錄製、下載的檔案不受影響：兩種都會存
const SMOOTH_KEY = 'panelSmooth';
let panelSmooth = false;
function setPanelSmooth(on) {
    panelSmooth = on;
    rawModeBtn.setAttribute('aria-pressed', String(!on));
    smoothModeBtn.setAttribute('aria-pressed', String(on));
    panelModeNote.textContent = on
        ? '平滑後的數字（和畫面上的骨架相同；x、y、z 都經過平滑，淡色是被擋掉的鬼點）。'
        : '原始資料（AI 直接輸出，未經平滑）。';
    try {
        localStorage.setItem(SMOOTH_KEY, on ? '1' : '0');
    } catch (err) {
        // 無法儲存也不影響使用
    }
    if (!dataPanel.hidden) updatePanel();
}
rawModeBtn.addEventListener('click', () => setPanelSmooth(false));
smoothModeBtn.addEventListener('click', () => setPanelSmooth(true));
try {
    if (localStorage.getItem(SMOOTH_KEY) === '1') setPanelSmooth(true);
} catch (err) {
    // 無痕模式等情況可能無法讀取，就用預設的原始資料
}
try {
    if (localStorage.getItem(PANEL_KEY) === '1') setPanelCollapsed(true);
} catch (err) {
    // 無痕模式等情況可能無法讀取，就用預設的展開
}
recordBtn.addEventListener('click', () => {
    if (recorder.recording) stopRecording();
    else if (countdown && !countdown.go) cancelCountdown();
    else startCountdown();
});
// 匯出：一段一段產生，不會讓畫面停住；產生中按鈕顯示「產生中…」，重複按不會再產生一份
// 不用 disabled 停用按鈕：停用會讓鍵盤焦點跑掉，用鍵盤操作的人產生完要重新找按鈕
let exporting = false;
function setExporting(on) {
    exporting = on;
    for (const b of [csvBtn, jsonBtn]) b.setAttribute('aria-disabled', on ? 'true' : 'false');
}
async function exportRecording(button, ext, chunks, mimeType) {
    if (exporting) return;
    const label = button.textContent;
    const name = recordingName(recorder.meta) + ext;
    setExporting(true);
    button.textContent = '產生中…';
    try {
        downloadBlob(name, await buildFile(chunks, mimeType));
    } catch (err) {
        console.error(err);
        alert('檔案產生失敗（可能是手機記憶體不夠），請改錄短一點再試');
    } finally {
        button.textContent = label;
        setExporting(false);
    }
}
csvBtn.addEventListener('click', () => { if (!exporting) exportRecording(csvBtn, '.csv', recorder.csvChunks(), 'text/csv'); });
jsonBtn.addEventListener('click', () => { if (!exporting) exportRecording(jsonBtn, '.json', recorder.jsonChunks(), 'application/json'); });
perfBtn.addEventListener('click', () => {
    perfExpanded = !perfExpanded;
    updatePerfInfo();
});

// ---------- 啟動 ----------

updateLabelBtn();

// iPhone 等不支援網頁全螢幕的裝置，隱藏全螢幕按鈕（畫面仍會佔滿視窗）
if (!document.fullscreenEnabled) {
    fullscreenBtn.hidden = true;
}

// 首頁「今天要做什麼運動？」的四個大按鈕（js/ui/start-pick.js）
const setStartDisabled = setupStartPick({
    grid: document.getElementById('workoutGrid'),
    freeLine: document.getElementById('freeLine'),
    startBtn,
    freeBtn: document.getElementById('freeBtn')
});
if (!isCameraSupported()) {
    statusText.textContent = '此瀏覽器不支援鏡頭功能，請改用新版 Chrome、Safari 或 Edge';
    setStartDisabled(true);
}

showWorkout();

initPose();

// 把 AI 檔案存在手機裡：第二次打開不用再下載，沒有網路也能用
setupOffline();
