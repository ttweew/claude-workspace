// 程式起點：取得畫面元素、串接鏡頭與 AI 骨架偵測、處理按鈕事件

import { SHOW_LABELS_AT_START, DEBUG } from './config.js';
import { isCameraSupported, openCamera, stopCamera, shouldMirror, activeDeviceId, listCameras, cameraErrorMessage } from './camera.js';
import { loadPoseModel } from './pose.js';
import { getDerivedPoints } from './landmarks.js';
import { drawSkeleton } from './draw.js';
import { videoRect, updateLabels, hideLabels, nearestPoint } from './labels.js';
import { FpsCounter } from './fps.js';
import { PoseSmoother } from './smooth.js';
import { isWakeLockSupported, isScreenKeptOn, keepScreenOn, allowScreenOff } from './screen.js';

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

// ---------- 狀態 ----------
let currentStream = null;
let cameraRequest = 0;      // 每次開啟或關閉鏡頭就加 1，用來丟棄已經過時的開啟請求
let pose = null;           // AI 偵測器（loadPoseModel 的結果），載入完成前為 null
let drawingUtils = null;    // MediaPipe 內建的畫骨架工具
let lastVideoTime = -1;
let animationId = null;
let showLabels = SHOW_LABELS_AT_START;  // 是否在每個點旁邊標出編號與名稱
let perfExpanded = false;   // 運算資訊標籤是否展開顯示詳細資訊
let lastPose = null;        // 最近一次偵測到的關鍵點，點選畫面時用來找最近的點
let picked = null;          // 使用者點選要查看的點與顯示期限 { id, until }
const fps = new FpsCounter();
const smoother = new PoseSmoother();  // 讓骨架點不抖動

// ---------- AI 模型 ----------

// 首頁與鏡頭畫面同時顯示 AI 模型的載入狀態
function setModelStatus(text) {
    modelStatus.textContent = text;
    setPoseStatus(text);
}

// 鏡頭畫面左上角的狀態標籤；kind 決定顏色：'ok' 綠、'warn' 橘、'error' 紅，沒有則為預設深藍
function setPoseStatus(text, kind) {
    poseStatus.textContent = text;
    poseStatus.dataset.kind = kind || '';
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
    } else {
        modelProgress.hidden = true;
    }
}

// 網頁一打開就在背景載入骨架模型，按下開啟鏡頭時通常已經準備好；失敗時鏡頭仍可正常使用
async function initPose() {
    const startTime = performance.now();
    try {
        const result = await loadPoseModel(progress => {
            if (!pose) showLoadingStage(progress);
        });
        drawingUtils = new result.vision.DrawingUtils(ctx);
        if (result.gpuName) perfBtn.title = '瀏覽器回報的 GPU：' + result.gpuName;
        pose = result;
        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);
        setModelStatus('AI 模型已就緒（載入 ' + seconds + ' 秒）');
        finishLoading(true);
        updatePerfInfo();
    } catch (err) {
        console.error(err);
        setModelStatus('AI 模型載入失敗（鏡頭仍可使用）');
        finishLoading(false);
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

// 每一個畫面都做一次骨架偵測，並把關鍵點、連線（與編號）畫出來
function detectPose() {
    if (!currentStream) return;
    if (pose && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        // 畫布和影像的長寬比例相同，座標才會對齊
        const dpr = fitOverlay();
        try {
            const now = performance.now();
            const result = pose.landmarker.detectForVideo(video, now);
            if (fps.tick(now)) updatePerfInfo();
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            if (result.landmarks.length > 0) {
                // landmarks[0] 就是 33 個關鍵點，每點有 x、y、z（0～1 的比例座標）
                // 畫面上用平滑後的點（不抖動）；原始的點保留在 raw，之後分析資料時使用
                const raw = result.landmarks[0];
                const landmarks = smoother.smooth(raw, now);
                const derived = getDerivedPoints(landmarks);
                drawSkeleton(drawingUtils, pose.vision.PoseLandmarker.POSE_CONNECTIONS, landmarks, derived, dpr);
                lastPose = { landmarks, raw, derived };
                showPoseLabels();
                setPoseStatus('已偵測到人體', 'ok');
            } else {
                lastPose = null;
                hideLabels();
                setPoseStatus('未偵測到人體，請站進畫面', 'warn');
            }
        } catch (err) {
            console.error(err);
            setPoseStatus('骨架偵測發生錯誤', 'error');
        }
    }
    animationId = requestAnimationFrame(detectPose);
}

// 顯示編號標籤：「顯示編號」開啟時標出主要關節；使用者點選的點另外顯示 3 秒
function showPoseLabels() {
    if (!lastPose) return;
    if (picked && performance.now() > picked.until) picked = null;
    const rect = videoRect(stage.clientWidth, stage.clientHeight, video.videoWidth, video.videoHeight);
    updateLabels(labelLayer, lastPose.landmarks, lastPose.derived, rect, video.classList.contains('mirrored'),
        showLabels, picked ? picked.id : null);
}

// 點畫面上任何一個點（包括臉、手指），顯示它的編號與名稱
function pickPoint(event) {
    if (!lastPose || event.target.closest('#toolbar, #infobar')) return;
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
    stage.hidden = false;
    const mirror = shouldMirror(stream);
    video.classList.toggle('mirrored', mirror);
    overlay.classList.toggle('mirrored', mirror);
    // 鏡頭中途斷線（外接鏡頭被拔掉、被其他程式搶走）：回到首頁並說明原因
    stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (stream !== currentStream) return;
        closeCamera();
        statusText.textContent = '鏡頭連線中斷（可能被拔除或被其他程式使用），請重新開啟鏡頭';
    });
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
function stopStream() {
    if (currentStream) {
        stopCamera(currentStream);
        currentStream = null;
    }
    video.srcObject = null;
    cancelAnimationFrame(animationId);
    fps.reset();
    smoother.reset();
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    lastVideoTime = -1;
    lastPose = null;
    picked = null;
    hideLabels();
}

// 關閉鏡頭並回到首頁
function closeCamera() {
    cameraRequest++;
    stopStream();
    allowScreenOff();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.hidden = true;
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
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentStream) keepScreenOn(updatePerfInfo);
});
document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? '離開全螢幕' : '全螢幕';
});
labelBtn.addEventListener('click', () => {
    showLabels = !showLabels;
    updateLabelBtn();
    showPoseLabels();
});
stage.addEventListener('click', pickPoint);
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

initPose();
