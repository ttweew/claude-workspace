// 離線使用：註冊 Service Worker（sw.js），把 AI 檔案存在手機裡
// 第二次打開不用再下載 AI 檔案（約 18 MB），之前打開過的頁面沒有網路也能用
// 網址加 ?sw=0：移除 Service Worker 和存起來的檔案（萬一出問題時用）

const OUR_CACHES = name => name.startsWith('ai-files-') || name.startsWith('site-files-');

export function setupOffline() {
    if (!('serviceWorker' in navigator)) return;
    if (new URLSearchParams(location.search).get('sw') === '0') {
        removeOffline();
        return;
    }
    // 等網頁載入完才註冊，不和一打開就開始的 AI 下載搶網路
    const register = () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('離線功能無法啟用，不影響使用：', err));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
}

async function deleteCaches() {
    if (!window.caches) return;
    const names = await caches.keys();
    await Promise.all(names.filter(OUR_CACHES).map(name => caches.delete(name)));
}

async function removeOffline() {
    try {
        const controller = navigator.serviceWorker.controller;
        // 先叫 Service Worker 停止存檔：這一頁正在下載的 AI 檔案，下載完也不會再存回去
        if (controller) controller.postMessage({ type: 'remove' });
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
        await deleteCaches();
        // 這一頁還是由舊的 Service Worker 處理（移除要等頁面關掉才生效）：重新整理一次，之後就完全不經過它
        // 重新整理後已經沒有 Service Worker，不會一直重新整理
        if (controller) {
            location.reload();
            return;
        }
        console.info('已移除離線功能與存起來的檔案');
    } catch (err) {
        console.warn('移除離線功能失敗：', err);
    }
}
