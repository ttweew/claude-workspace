// 加到手機主畫面（10/29）：網站像 App 一樣有圖示、從主畫面打開時沒有網址列（manifest.webmanifest）
// Chrome、Edge（Android、電腦）判斷可以安裝時會發 beforeinstallprompt：這時首頁頁尾才出現「加到主畫面」，按了跳出瀏覽器自己的安裝視窗
// iPhone、iPad 的 Safari 沒有這個事件，按鈕不出現：使用說明寫「分享 → 加入主畫面」
// 已經是從主畫面打開的（standalone）就不出現

// 現在是不是從主畫面打開的（沒有網址列）；navigator.standalone 是 iPhone 的 Safari 用的
export function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

// button：首頁頁尾的「加到主畫面」按鈕（一開始藏起來）
export function setupInstall(button) {
    if (!button) return;
    let deferred = null;
    window.addEventListener('beforeinstallprompt', event => {
        // 先不要讓瀏覽器自己跳出來（使用者還在運動），等按按鈕
        event.preventDefault();
        if (isStandalone()) return;
        deferred = event;
        button.hidden = false;
    });
    button.addEventListener('click', async () => {
        if (!deferred) return;
        const event = deferred;
        deferred = null;
        button.hidden = true;
        try {
            await event.prompt();
        } catch (err) {
            // 跳不出來（瀏覽器不讓、已經裝過）：就算了，使用說明也有手動的步驟
        }
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        button.hidden = true;
    });
}
