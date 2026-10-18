// 程式起點：取得畫面元素、串接鏡頭與 AI 骨架偵測、處理按鈕事件

import { SHOW_LABELS_AT_START } from './config.js';
import { isCameraSupported, openCamera, stopCamera, shouldMirror, activeDeviceId, listCameras } from './camera.js';
import { loadPoseModel } from './pose.js';
import { getDerivedPoints } from './landmarks.js';
import { drawSkeleton, drawLabels } from './draw.js';
import { FpsCounter } from './fps.js';

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
const perfBtn = document.getElementById('perfBtn');

// ---------- 狀態 ----------
let currentStream = null;
let pose = null;            // AI 偵測器（loadPoseModel 的結果），載入完成前為 null
let drawingUtils = null;    // MediaPipe 內建的畫骨架工具
let lastVideoTime = -1;
let animationId = null;
let showLabels = SHOW_LABELS_AT_START;  // 是否在每個點旁邊標出編號與名稱
let perfExpanded = false;   // 運算資訊標籤是否展開顯示詳細資訊
const fps = new FpsCounter();

// ---------- AI 模型 ----------

// 首頁與鏡頭畫面同時顯示 AI 模型的載入狀態
function setModelStatus(text) {
    modelStatus.textContent = text;
    poseStatus.textContent = text;
}

// 網頁一打開就在背景載入骨架模型，按下開啟鏡頭時通常已經準備好；失敗時鏡頭仍可正常使用
async function initPose() {
    const startTime = performance.now();
    try {
        const result = await loadPoseModel(p => {
            if (!pose) setModelStatus('AI 模型下載中 ' + Math.round(p * 100) + '%');
        });
        drawingUtils = new result.vision.DrawingUtils(ctx);
        if (result.gpuName) perfBtn.title = '瀏覽器回報的 GPU：' + result.gpuName;
        pose = result;
        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);
        setModelStatus('AI 模型已就緒（載入 ' + seconds + ' 秒）');
        updatePerfInfo();
    } catch (err) {
        console.error(err);
        setModelStatus('AI 模型載入失敗（鏡頭仍可使用）');
    }
}

// 運算資訊標籤：平常只顯示「GPU · 30 FPS」，點一下展開成「GPU：晶片名稱 · 30 FPS」
function updatePerfInfo() {
    if (!pose) return;
    const parts = [perfExpanded ? pose.computeMode + '：' + pose.computeDetail : pose.computeMode];
    if (currentStream) parts.push(fps.value ? fps.value + ' FPS' : 'FPS 計算中');
    perfBtn.textContent = parts.join(' · ');
    perfBtn.hidden = false;
}

// 每一個畫面都做一次骨架偵測，並把關鍵點、連線（與編號）畫出來
function detectPose() {
    if (!currentStream) return;
    if (pose && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        // 畫布大小跟鏡頭原始解析度一致，座標才會對齊
        if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
        }
        try {
            const now = performance.now();
            const result = pose.landmarker.detectForVideo(video, now);
            if (fps.tick(now)) updatePerfInfo();
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            if (result.landmarks.length > 0) {
                // landmarks[0] 就是 33 個關鍵點，每點有 x、y、z（0～1 的比例座標）
                const landmarks = result.landmarks[0];
                const derived = getDerivedPoints(landmarks);
                drawSkeleton(drawingUtils, pose.vision.PoseLandmarker.POSE_CONNECTIONS, landmarks, derived);
                if (showLabels) drawLabels(ctx, landmarks, derived, stage.clientWidth, stage.clientHeight);
                poseStatus.textContent = '已偵測到人體';
            } else {
                poseStatus.textContent = '未偵測到人體，請站進畫面';
            }
        } catch (err) {
            console.error(err);
            poseStatus.textContent = '骨架偵測發生錯誤';
        }
    }
    animationId = requestAnimationFrame(detectPose);
}

// ---------- 鏡頭 ----------

// 開啟鏡頭並切換到全畫面；沒指定 deviceId 時使用裝置預設鏡頭
async function startCamera(deviceId) {
    stopStream();
    try {
        currentStream = await openCamera(deviceId);
        video.srcObject = currentStream;
        statusText.textContent = '鏡頭已開啟';
        stage.hidden = false;
        const mirror = shouldMirror(currentStream);
        video.classList.toggle('mirrored', mirror);
        overlay.classList.toggle('mirrored', mirror);
        detectPose();
        updatePerfInfo();
        await fillCameraSelect();
    } catch (err) {
        closeCamera();
        statusText.textContent = '無法開啟鏡頭：' + err.name + '（' + err.message + '）';
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
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    lastVideoTime = -1;
}

// 關閉鏡頭並回到首頁
function closeCamera() {
    stopStream();
    if (document.fullscreenElement) document.exitFullscreen();
    stage.hidden = true;
    statusText.textContent = '鏡頭已關閉';
}

// 把所有鏡頭放進下拉選單，並選到目前使用的那一顆
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
}

// ---------- 按鈕 ----------

// 全螢幕會連瀏覽器網址列一起隱藏；瀏覽器規定必須由使用者按鈕觸發
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        stage.requestFullscreen();
    }
}

function updateLabelBtn() {
    labelBtn.textContent = showLabels ? '隱藏編號' : '顯示編號';
}

startBtn.addEventListener('click', () => startCamera(cameraSelect.value));
stopBtn.addEventListener('click', closeCamera);
cameraSelect.addEventListener('change', () => startCamera(cameraSelect.value));
fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? '離開全螢幕' : '全螢幕';
});
labelBtn.addEventListener('click', () => {
    showLabels = !showLabels;
    updateLabelBtn();
});
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
