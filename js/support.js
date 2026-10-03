// 這支手機（瀏覽器）能不能跑 AI：載入 AI 前先檢查（pose.js），使用說明頁的「檢查這支手機」也用這份
//
// 硬性需求：WebGL2。MediaPipe 就算用 CPU 計算，處理影像時還是要用 WebGL2；
// 沒有的話 AI 會在開鏡頭後直接中止（實測：Check failed … gl_texture_buffer），所以一開始就要擋下來說明清楚
// iPhone：iOS 15 以上的 Safari 才預設開啟 WebGL2（iPhone 上所有瀏覽器都用 Safari 的核心，看的是 iOS 版本）
// Android：Chrome 支援，但少數舊手機的 GPU 被 Chrome 停用時就沒有

export function hasWebGL2() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return false;
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return true;
    } catch (err) {
        return false;
    }
}

// 背景執行緒裡能不能用 WebGL2（可以的話 AI 在背景用 GPU 算，畫面最順）；iPhone 要 iOS 17 以上
export function hasWorkerWebGL2() {
    try {
        if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') return false;
        const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
        if (!gl) return false;
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return true;
    } catch (err) {
        return false;
    }
}

// 從瀏覽器的識別字串看出系統與瀏覽器版本（只用來顯示和判斷門檻，不會傳到任何地方）
export function describeDevice(ua = navigator.userAgent) {
    const ios = ua.match(/\b(?:iPhone|iPad|iPod)\b.*? OS (\d+)[_.](\d+)/);
    // iPad 的 Safari 預設假裝成 Mac：有觸控螢幕的「Mac」就是 iPad
    const ipadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const android = ua.match(/Android (\d+(?:\.\d+)?)/);
    // osVersion：顯示用的版本文字（例如「17.5」）；osMajor：主版本號，判斷門檻用
    let os = '其他系統', osVersion = '';
    if (ios) {
        os = /iPad/.test(ua) ? 'iPadOS' : 'iOS';
        osVersion = ios[1] + '.' + ios[2];
    } else if (ipadAsMac) {
        const v = ua.match(/Version\/(\d+)\.(\d+)/);
        os = 'iPadOS';
        osVersion = v ? v[1] + '.' + v[2] : '';
    } else if (android) {
        os = 'Android';
        osVersion = android[1];
    } else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    // App 內建的瀏覽器（LINE、Instagram、Facebook）常常不能用相機
    const inApp = /\bLine\/|Instagram|FBAN|FBAV|FB_IAB|MicroMessenger/i.test(ua);
    let browser = '其他瀏覽器';
    const m = ua.match(/(EdgA?|EdgiOS)\/(\d+)/) || ua.match(/(SamsungBrowser)\/(\d+)/) || ua.match(/(CriOS|Chrome)\/(\d+)/)
        || ua.match(/(FxiOS|Firefox)\/(\d+)/) || ua.match(/Version\/(\d+).*(Safari)/);
    if (inApp) browser = 'App 內建瀏覽器';
    else if (m) {
        const names = { Edg: 'Edge', EdgA: 'Edge', EdgiOS: 'Edge', SamsungBrowser: '三星瀏覽器', CriOS: 'Chrome', Chrome: 'Chrome', FxiOS: 'Firefox', Firefox: 'Firefox' };
        browser = m[2] === 'Safari' ? 'Safari ' + m[1] : (names[m[1]] || m[1]) + ' ' + m[2];
    }
    return { os, osVersion, osMajor: osVersion ? parseInt(osVersion, 10) : null, browser, inApp };
}

// 整體檢查：回傳每一項的結果，以及結論（level：'ok' 可以用、'warn' 可以用但有限制、'no' 不能用）
export function checkSupport() {
    const device = describeDevice();
    const camera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const webgl2 = hasWebGL2();
    const workerGpu = hasWorkerWebGL2();
    const wakeLock = 'wakeLock' in navigator;
    const offline = 'serviceWorker' in navigator;
    const items = [
        { name: '系統', value: device.os + (device.osVersion ? ' ' + device.osVersion : '') },
        { name: '瀏覽器', value: device.browser },
        { name: '相機', ok: camera && !device.inApp, value: device.inApp ? '在 App 內建瀏覽器裡，通常不能用相機' : camera ? '可以' : '不支援' },
        { name: 'AI 需要的 WebGL2', ok: webgl2, value: webgl2 ? '支援' : '不支援（AI 無法執行）' },
        { name: 'AI 在背景運算', ok: workerGpu, soft: true, value: workerGpu ? '可以（畫面最順）' : '不行，改在主畫面運算（可以用，按鈕反應會慢一點）' },
        { name: '運動時螢幕保持亮著', ok: wakeLock, soft: true, value: wakeLock ? '可以' : '不行（請自己把自動鎖定調長）' },
        { name: '離線使用', ok: offline, soft: true, value: offline ? '可以' : '不行（每次都要下載 AI 檔案）' }
    ];
    let level = 'ok', verdict = '可以使用，所有功能都支援';
    const soft = items.filter(i => i.soft && i.ok === false);
    if (soft.length) {
        level = 'warn';
        verdict = '可以使用，但' + soft.map(i => i.name).join('、') + '不支援';
    }
    if (!webgl2 || !camera || device.inApp) {
        level = 'no';
        verdict = device.inApp ? '請改用 Chrome 或 Safari 開啟' : !camera ? '這個瀏覽器不能使用相機' : '這支手機的瀏覽器不支援 AI 需要的 WebGL2';
    }
    return { level, verdict, items, device };
}

// 不支援時給使用者的建議
export function unsupportedAdvice(device = describeDevice()) {
    if (device.os === 'iOS' || device.os === 'iPadOS') return '需要 iOS 15 以上：請到「設定 → 一般 → 軟體更新」更新系統；iPhone 6 以前的機型無法更新到 iOS 15';
    if (device.os === 'Android') return '請把 Chrome 更新到最新版再試；還是不行的話，這支手機的 GPU 可能被瀏覽器停用，請改用其他手機或電腦';
    return '請改用最新版的 Chrome、Edge 或 Safari';
}
