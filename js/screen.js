// 讓螢幕保持亮著：手機放著運動時，一段時間沒碰螢幕就會變暗、鎖定，鏡頭也會跟著中斷
// 使用瀏覽器內建的 Screen Wake Lock 功能；不支援的瀏覽器就維持原本行為

let wakeLock = null;

// 瀏覽器是否支援
export function isWakeLockSupported() {
    return 'wakeLock' in navigator;
}

// 目前螢幕是否被保持亮著
export function isScreenKeptOn() {
    return wakeLock !== null && !wakeLock.released;
}

// 開始保持螢幕亮著；onChange：狀態改變時通知（例如切到別的 App 時瀏覽器會自動解除）
export async function keepScreenOn(onChange) {
    if (!isWakeLockSupported() || isScreenKeptOn()) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => onChange && onChange());
        if (onChange) onChange();
    } catch (err) {
        // 例如省電模式或頁面不在前景時，瀏覽器可能拒絕；不影響其他功能
        console.warn('無法保持螢幕亮著：', err);
    }
}

// 解除，讓螢幕恢復正常的自動變暗
export function allowScreenOff() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}
