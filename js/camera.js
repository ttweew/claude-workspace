// 鏡頭：開啟、關閉、判斷前後鏡頭、列出所有鏡頭
// 這裡只處理鏡頭本身，畫面上的文字與按鈕由 main.js 負責

// 瀏覽器是否支援鏡頭功能
export function isCameraSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// 開啟鏡頭並回傳鏡頭串流；沒指定 deviceId 時使用裝置預設鏡頭
// 第一次使用時瀏覽器會詢問使用者是否允許相機
export function openCamera(deviceId) {
    return navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false
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

// 目前串流使用的是哪一顆鏡頭
export function activeDeviceId(stream) {
    return stream.getVideoTracks()[0].getSettings().deviceId;
}

// 列出所有可用鏡頭（手機前後鏡頭、筆電內建、外接 USB 鏡頭等）
// 取得相機權限後才看得到鏡頭名稱，所以要在開啟鏡頭後呼叫
export async function listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
        .filter(d => d.kind === 'videoinput')
        .map((camera, i) => ({ deviceId: camera.deviceId, label: camera.label || '鏡頭 ' + (i + 1) }));
}
