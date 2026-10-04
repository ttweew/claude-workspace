// 鏡頭：開啟、關閉、判斷前後鏡頭、列出所有鏡頭
// 這裡只處理鏡頭本身，畫面上的文字與按鈕由 main.js 負責

import { CAMERA_RESOLUTION } from '../config.js';

// 瀏覽器是否支援鏡頭功能
export function isCameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// 開啟鏡頭並回傳鏡頭串流；沒指定 deviceId 時使用裝置預設鏡頭
// 第一次使用時瀏覽器會詢問使用者是否允許相機
// 解析度用 ideal（建議值）：鏡頭不支援時瀏覽器會自動選最接近的，不會開啟失敗
export function openCamera(deviceId) {
    const video = { width: { ideal: CAMERA_RESOLUTION[0] }, height: { ideal: CAMERA_RESOLUTION[1] } };
    if (deviceId) video.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ video: video, audio: false });
}

// 停止鏡頭串流（鏡頭指示燈會熄滅）
export function stopCamera(stream) {
    stream.getTracks().forEach(track => track.stop());
}

// 手機後鏡頭拍的是別人，不需要鏡像；前鏡頭與電腦鏡頭預設鏡像
export function shouldMirror(stream) {
    return stream.getVideoTracks()[0].getSettings().facingMode !== 'environment';
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
