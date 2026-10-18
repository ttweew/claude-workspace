// 鏡頭：開啟、關閉、判斷前後鏡頭、列出所有鏡頭
// 這裡只處理鏡頭本身，畫面上的文字與按鈕由 main.js 負責

import { CAMERA_RESOLUTION, FPS_CHOICES, FPS_FROM_URL } from '../config.js';

// 使用者選的每秒格數（30、60、90、120，或 'auto' 自動），網站會記住；網址的 ?fps= 優先，但不記住
// 自動：從每秒 30 格開始，main.js 依 AI 實際的速度用 setAutoRate() 在 30、60 之間調整
const FPS_KEY = 'cameraFps';
let choice = FPS_FROM_URL || loadChoice();
let autoRate = 30;   // 自動時目前用每秒幾格
function loadChoice() {
    try {
        const saved = localStorage.getItem(FPS_KEY);
        if (saved === 'auto') return 'auto';
        if (FPS_CHOICES.includes(Number(saved))) return Number(saved);
    } catch (err) { /* 不能讀就用預設 */ }
    return 30;
}
// 使用者選的：30、60、90、120 或 'auto'
export function getFpsChoice() {
    return choice;
}
export function isAutoFps() {
    return choice === 'auto';
}
// 現在要鏡頭給每秒幾格（自動時是目前調到的格數）
export function getFrameRate() {
    return choice === 'auto' ? autoRate : choice;
}
export function setFrameRate(fps) {
    if (fps !== 'auto' && !FPS_CHOICES.includes(fps)) return;
    choice = fps;
    autoRate = 30;
    try { localStorage.setItem(FPS_KEY, String(fps)); } catch (err) { /* 不能存就不記 */ }
}
export function setAutoRate(rate) {
    autoRate = rate;
}

// 瀏覽器是否支援鏡頭功能
export function isCameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// 開啟鏡頭並回傳鏡頭串流；沒指定 deviceId 時使用裝置預設鏡頭
// 第一次使用時瀏覽器會詢問使用者是否允許相機
// 解析度用 ideal（建議值）：鏡頭不支援時瀏覽器會自動選最接近的，不會開啟失敗
// 每秒格數選 60 以上時也是 ideal：鏡頭做不到就用它做得到的，照樣能開；選 30 時不指定，和以前一樣用鏡頭預設的
export function openCamera(deviceId) {
    const video = { width: { ideal: CAMERA_RESOLUTION[0] }, height: { ideal: CAMERA_RESOLUTION[1] } };
    if (getFrameRate() > 30) video.frameRate = { ideal: getFrameRate() };
    if (deviceId) video.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ video: video, audio: false });
}

// 開著鏡頭直接換每秒格數（自動調整用）：不用重開鏡頭，畫面不會黑一下
// 瀏覽器不支援時 Promise 失敗，由 main.js 改成重開鏡頭；換的時候要連解析度一起給，不然瀏覽器可能換掉解析度
export function changeFrameRate(stream, rate) {
    return stream.getVideoTracks()[0].applyConstraints({
        width: { ideal: CAMERA_RESOLUTION[0] }, height: { ideal: CAMERA_RESOLUTION[1] }, frameRate: { ideal: rate }
    });
}

// 停止鏡頭串流（鏡頭指示燈會熄滅）
export function stopCamera(stream) {
    stream.getTracks().forEach(track => track.stop());
}

// 手機後鏡頭拍的是別人，不需要鏡像；前鏡頭與電腦鏡頭預設鏡像
export function shouldMirror(stream) {
    return stream.getVideoTracks()[0].getSettings().facingMode !== 'environment';
}

// 鏡頭設定的每秒格數（瀏覽器回報的；不知道時是 0）
export function cameraFrameRate(stream) {
    return Math.round(stream.getVideoTracks()[0].getSettings().frameRate || 0);
}

// 這顆鏡頭最多每秒幾格（瀏覽器回報的；不知道時是 0，例如舊的 Safari 沒有 getCapabilities）
export function maxFrameRate(stream) {
    const track = stream.getVideoTracks()[0];
    try {
        const caps = track.getCapabilities ? track.getCapabilities() : null;
        return caps && caps.frameRate && caps.frameRate.max ? Math.round(caps.frameRate.max) : 0;
    } catch (err) {
        return 0;
    }
}

// 目前串流使用的是哪一顆鏡頭
export function activeDeviceId(stream) {
    return stream.getVideoTracks()[0].getSettings().deviceId;
}

// 把瀏覽器的錯誤代碼翻成使用者看得懂、知道下一步怎麼做的中文說明
export function cameraErrorMessage(err) {
    switch (err.name) {
        case 'NotAllowedError':
            return '無法使用相機：相機權限被拒絕。請在瀏覽器的網站設定中允許相機，再重新整理頁面；'
                + '若是在 LINE、Instagram 等 App 裡開啟，請改用 Chrome 或 Safari';
        case 'NotFoundError':
            return '找不到鏡頭：請確認裝置有鏡頭，或外接鏡頭已經接好';
        case 'NotReadableError':
            return '鏡頭無法使用：可能正被其他程式（例如視訊會議）使用中，請關閉後再試';
        case 'OverconstrainedError':
            return '找不到選擇的鏡頭，請重新選擇';
        case 'SecurityError':
            return '瀏覽器基於安全性封鎖了相機，請使用 https 開頭的網址開啟';
        default:
            return '無法開啟鏡頭：' + err.name + '（' + err.message + '）';
    }
}

// 列出所有可用鏡頭（手機前後鏡頭、筆電內建、外接 USB 鏡頭等）
// 取得相機權限後才看得到鏡頭名稱，所以要在開啟鏡頭後呼叫
export async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
        .filter(d => d.kind === 'videoinput')
        .map((camera, i) => ({ deviceId: camera.deviceId, label: camera.label || '鏡頭 ' + (i + 1) }));
}
