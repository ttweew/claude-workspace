// 程式起點：取得畫面元素、串接鏡頭與 AI 骨架偵測、處理按鈕事件

import { SHOW_LABELS_AT_START, DEBUG, POSE_MODEL_NAME, LAB } from './config.js';
import { isCameraSupported, openCamera, stopCamera, shouldMirror, activeDeviceId, listCameras, cameraErrorMessage } from './camera.js';
import { loadPoseModel } from './pose.js';
import { drawSkeleton } from './draw.js';
import { videoRect, updateLabels, hideLabels, nearestPoint } from './labels.js';
import { FpsCounter } from './fps.js';
import { PosePipeline } from './pipeline.js';
import { framingAdvice, FramingHint } from './framing.js';
import { PoseRecorder, downloadText, recordingName } from './recorder.js';
import { updateDataPanel, updateViewInfo } from './datapanel.js';
import { Hud } from './hud.js';
import { isWakeLockSupported, isScreenKeptOn, keepScreenOn, allowScreenOff } from './screen.js';
import { SquatCounter, DEPTH_TEXT } from './squat.js';

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
const dataPanel = document.getElementById('dataPanel');
const dataRows = document.getElementById('dataRows');
const viewInfo = document.getElementById('viewInfo');
const recordBtn = document.getElementById('recordBtn');
const recordInfo = document.getElementById('recordInfo');
const csvBtn = document.getElementById('csvBtn');
const jsonBtn = document.getElementById('jsonBtn');
const banner = document.getElementById('banner');
const hudRoot = document.getElementById('hud');
const hudRepsBox = document.getElementById('hudRepsBox');  // 深蹲次數（?lab=squat 才顯示）
const hudReps = document.getElementById('hudReps');
const repToast = document.getElementById('repToast');
const hud = new Hud({
    root: hudRoot,
    kneeName: document.getElementById('hudKneeName'), knee: document.getElementById('hudKnee'),
    hipName: document.getElementById('hudHipName'), hip: document.getElementById('hudHip')
});

// ---------- 狀態 ----------
let currentStream = null;
let cameraRequest = 0;      // 每次開啟或關閉鏡頭就加 1，用來丟棄已經過時的開啟請求
let pose = null;           // AI 偵測器（loadPoseModel 的結果），載入完成前為 null
let drawingUtils = null;    // MediaPipe 內建的畫骨架工具
let lastVideoTime = -1;
let frameRequest = null;    // 下一次偵測的排程，關閉鏡頭時取消
let failures = 0;           // 連續偵測出錯的次數
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
const fps = new FpsCounter();
const pipeline = new PosePipeline();  // 平滑、擋鬼點、角度、拍攝方向
// 深蹲次數與深度（實驗中）：網址加 ?lab=squat 才啟用
const squat = LAB === 'squat' ? new SquatCounter() : null;
// 一直顯示角度的關節：先顯示下半身（深蹲、弓箭步最需要），之後依照選擇的運動切換
const SHOWN_ANGLES = ['LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_HIP', 'RIGHT_HIP'];
const framing = new FramingHint();    // 入鏡提示（請往後退、請站到中間…）
const recorder = new PoseRecorder();  // 錄製關鍵點資料，匯出 CSV / JSON
let lastPanelUpdate = 0;              // 數據面板上次更新的時間（每秒更新 5 次，數字才看得清楚）

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
        if (await tryLoadPose(loadCount++)) break;
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

// 載入一次；成功回傳 true
async function tryLoadPose(attempt) {
    const startTime = performance.now();
    try {
        const result = await loadPoseModel(progress => {
            if (!pose) showLoadingStage(progress);
        }, attempt);
        drawingUtils = new result.vision.DrawingUtils(ctx);
        if (result.gpuName) perfBtn.title = '瀏覽器回報的 GPU：' + result.gpuName;
        pose = result;
        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);
        setModelStatus('AI 模型已就緒（載入 ' + seconds + ' 秒）');
        finishLoading(true);
        updatePerfInfo();
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

// 運算資訊標籤：平常只顯示「GPU · 30 FPS」
// 點一下展開成「GPU：晶片名稱 · 30 FPS · 螢幕保持亮著」
// 測試模式（網址加 ?debug）另外顯示「載入花費：下載 X 秒、啟動 Y 秒、暖機 Z 秒」，給開發團隊找出載入慢在哪裡
function updatePerfInfo() {
    if (!pose) return;
    const parts = [perfExpanded ? pose.computeMode + '：' + pose.computeDetail : pose.computeMode];
    if (currentStream) parts.push(fps.value ? fps.value + ' FPS' : 'FPS 計算中');
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
    console.warn('AI 重新啟動：' + reason);
    clearPose();
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
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    lastPose = null;
    hideLabels();
    hud.update(null);
    framing.reset();
}

// 每一格新畫面做一次骨架偵測，並把關鍵點、連線（與編號）畫出來
// frame：requestVideoFrameCallback 提供的畫面資訊；用「第幾格」判斷是不是新畫面，
// 不用影像時間（有些瀏覽器的鏡頭影像時間不會每格都變，會漏掉畫面）
function detectPose(time, frame) {
    frameRequest = null;
    if (!currentStream) return;
    if (pose && !restarting && pose.gpuLost()) restartPose('GPU 被系統收回');
    const frameId = frame ? 'f' + frame.presentedFrames : video.currentTime;
    if (pose && !restarting && video.readyState >= 2 && frameId !== lastVideoTime) {
        lastVideoTime = frameId;
        // 畫布和影像的長寬比例相同，座標才會對齊
        const dpr = fitOverlay();
        try {
            const now = performance.now();
            const result = pose.landmarker.detectForVideo(video, now);
            if (fps.tick(now)) updatePerfInfo();
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            // landmarks[0] 就是 33 個關鍵點，每點有 x、y、z（0～1 的比例座標）
            // 畫面上用平滑後的點（不抖動）；原始的點保留在 raw，之後分析資料時使用
            const raw = result.landmarks[0];
            // worldLandmarks：以公尺為單位的 3D 座標（髖部中心為原點），錄製時保存
            const rawWorld = result.worldLandmarks && result.worldLandmarks[0];
            // 平滑 → 擋鬼點 → 角度 → 拍攝方向（js/pipeline.js）；沒有人或是鬼骨架時為 null
            const processed = pipeline.process(raw, now, video.videoWidth, video.videoHeight);
            if (processed) {
                const { landmarks, derived, angles } = processed;
                drawSkeleton(drawingUtils, pose.vision.PoseLandmarker.POSE_CONNECTIONS, landmarks, derived, dpr);
                // 拍攝方向（view）之後做動作判斷時使用，目前顯示在數據面板
                lastPose = { ...processed, raw, rawWorld };
                showPoseLabels();
                hud.update(landmarks, angles);
                // 依拍到的部位提示怎麼站，全身入鏡時顯示綠色「已偵測到全身」
                const hint = framing.update(framingAdvice(landmarks), now);
                // 深蹲實驗：站位沒問題、但是正面拍時，改提示側身
                const prompt = updateSquat(processed, now);
                if (prompt && hint.kind === 'ok') setPoseStatus(prompt, 'warn');
                else setPoseStatus(hint.text, hint.kind);
            } else {
                clearPose();
                updateSquat(null, now);
                setPoseStatus('未偵測到人體，請站進畫面', 'warn');
            }
            // 錄製與數據面板都用原始資料（未平滑、未過濾，模型輸出什麼就記什麼）
            if (recorder.recording && !recorder.add(now, raw, rawWorld)) {
                stopRecording();
            }
            if (now - lastPanelUpdate > 200) {
                lastPanelUpdate = now;
                if (!dataPanel.hidden) updatePanel();
                if (recorder.recording) showRecordInfo();
            }
            failures = 0;
        } catch (err) {
            // 同樣的錯誤每一格都印，會塞爆主控台、拖慢速度，只印第一次
            if (failures === 0) console.error(err);
            failures++;
            if (failures >= MAX_FAILURES) restartPose('連續 ' + failures + ' 格偵測出錯');
        }
    }
    scheduleDetect();
}

// ---------- 深蹲實驗功能（?lab=squat） ----------

let toastTimer = null;

// 每一格更新次數；完成一下時顯示這一下的深度。回傳要提醒使用者的話（例如請側身），沒有則為 null
function updateSquat(processed, now) {
    if (!squat) return null;
    const result = squat.update(processed, now);
    const text = String(result.reps);
    if (hudReps.textContent !== text) hudReps.textContent = text;
    if (result.rep) showRepToast(result.rep);
    return result.prompt;
}

function showRepToast(rep) {
    // 數據面板打開時，大字儀表板也是收起來的（近距離看數字用），提示也不顯示，避免疊在面板上
    if (!dataPanel.hidden) return;
    repToast.textContent = '第 ' + rep.n + ' 下 · ' + Math.round(rep.minKnee) + '° ' + DEPTH_TEXT[rep.depth];
    repToast.className = rep.depth;
    repToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { repToast.hidden = true; }, 2500);
}

function resetSquat() {
    if (!squat) return;
    squat.reset();
    hudReps.textContent = '0';
    clearTimeout(toastTimer);
    repToast.hidden = true;
}

// 顯示標籤：關節角度一直顯示；「顯示編號」開啟時標出主要關節；使用者點選的點另外顯示 3 秒
function showPoseLabels() {
    if (!lastPose) return;
    if (picked && performance.now() > picked.until) picked = null;
    const rect = videoRect(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight);
    updateLabels(labelLayer, lastPose.landmarks, lastPose.derived, rect, video.classList.contains('mirrored'),
        showLabels, picked ? picked.id : null, shownAngles());
}

// 要一直顯示的關節角度
function shownAngles() {
    const angles = {};
    for (const key of SHOWN_ANGLES) angles[key] = lastPose.angles[key];
    return angles;
}

// 點畫面上任何一個點（包括臉、手指），顯示它的編號與名稱
function pickPoint(event) {
    if (!lastPose || event.target.closest('#toolbar, #infobar, #dataPanel')) return;
    const bounds = stage.getBoundingClientRect();
    const rect = videoRect(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight);
    const id = nearestPoint(event.clientX - bounds.left, event.clientY - bounds.top,
        lastPose.landmarks, lastPose.derived, rect, video.classList.contains('mirrored'), 40);
    picked = id === null ? null : { id, until: performance.now() + 3000 };
    showPoseLabels();
}

// ---------- 鏡頭 ----------

// 開啟鏡頭並切換到全畫面；沒指定 deviceId 時使用裝置預設鏡頭
async function startCamera(deviceId) {
    const request = ++cameraRequest;
    stopStream();
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
    // 保險起見主動播放（iPhone 省電模式可能擋掉自動播放，畫面會停在第一格）
    video.play().catch(() => {});
    statusText.textContent = '鏡頭已開啟';
    showStage(true);
    hudRoot.hidden = !dataPanel.hidden;
    const mirror = shouldMirror(stream);
    video.classList.toggle('mirrored', mirror);
    overlay.classList.toggle('mirrored', mirror);
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
    if (recorder.recording) stopRecording();
    if (currentStream) {
        stopCamera(currentStream);
        currentStream = null;
    }
    video.srcObject = null;
    cancelDetect();
    fps.reset();
    pipeline.reset();
    framing.reset();
    resetSquat();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    lastVideoTime = -1;
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
function showStage(on) {
    if (stage.hidden !== on) return;
    stage.hidden = !on;
    page.inert = on;
    const focused = document.activeElement;
    if (on && (focused === startBtn || focused === document.body)) stopBtn.focus();
    if (!on && (stage.contains(focused) || focused === document.body)) startBtn.focus();
}

// 關閉鏡頭並回到首頁
function closeCamera() {
    cameraRequest++;
    stopStream();
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
    dataBtn.textContent = (dataPanel.hidden ? '數據' : '隱藏數據') + (recorder.recording ? ' ●' : '');
}

function showRecordInfo() {
    recordInfo.textContent = (recorder.recording ? '錄製中 ' : '已錄 ') + recorder.seconds.toFixed(1)
        + ' 秒 · ' + recorder.frameCount + ' 格';
}

function startRecording() {
    recorder.start({
        app: 'AI 智慧運動分析系統',
        model: POSE_MODEL_NAME,
        computeMode: pose ? pose.computeMode : '',
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        // 畫面只是顯示時鏡像；錄下的座標一律是鏡頭原始畫面（未鏡像）
        displayMirrored: video.classList.contains('mirrored'),
        userAgent: navigator.userAgent
    });
    recordBtn.textContent = '■ 停止錄製';
    recordBtn.classList.add('recording');
    updateDataBtn();
    csvBtn.hidden = true;
    jsonBtn.hidden = true;
    showRecordInfo();
}

function stopRecording() {
    recorder.stop();
    recordBtn.textContent = '● 重新錄製';
    recordBtn.classList.remove('recording');
    updateDataBtn();
    showRecordInfo();
    csvBtn.hidden = jsonBtn.hidden = recorder.frameCount === 0;
}

// 數據面板：原始數值表格，以及動作判斷用的資訊
function updatePanel() {
    updateDataPanel(dataRows, lastPose && lastPose.raw);
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

function updateLabelBtn() {
    labelBtn.textContent = showLabels ? '隱藏編號' : '顯示編號';
}

startBtn.addEventListener('click', () => startCamera(cameraSelect.value));
stopBtn.addEventListener('click', closeCamera);
cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
fullscreenBtn.addEventListener('click', toggleFullscreen);
// 切到別的 App 再回來時，瀏覽器會自動解除螢幕常亮，這裡重新開啟
// iPhone 切回來時影像可能停在最後一格，主動繼續播放
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !currentStream) return;
    keepScreenOn(updatePerfInfo);
    if (video.paused) video.play().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? '離開全螢幕' : '全螢幕';
});
labelBtn.addEventListener('click', () => {
    showLabels = !showLabels;
    saveLabelSetting(showLabels);
    updateLabelBtn();
    showPoseLabels();
});
stage.addEventListener('click', pickPoint);
dataBtn.addEventListener('click', toggleDataPanel);
recordBtn.addEventListener('click', () => (recorder.recording ? stopRecording() : startRecording()));
csvBtn.addEventListener('click', () => downloadText(recordingName(recorder.meta) + '.csv', recorder.toCSV(), 'text/csv'));
jsonBtn.addEventListener('click', () => downloadText(recordingName(recorder.meta) + '.json', recorder.toJSON(), 'application/json'));
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

if (!isCameraSupported()) {
    statusText.textContent = '此瀏覽器不支援鏡頭功能，請改用新版 Chrome、Safari 或 Edge';
    startBtn.disabled = true;
}

// 深蹲實驗：顯示次數，重播分析的連結也帶上 ?lab=squat
if (squat) {
    hudRepsBox.hidden = false;
    hudRoot.classList.add('lab');
    document.getElementById('replayLink').href = 'replay.html?lab=squat';
}

initPose();
