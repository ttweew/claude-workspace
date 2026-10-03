// Service Worker：把 AI 檔案存在手機裡，第二次打開不用再下載，沒有網路也能用
//
// 兩種檔案、兩種做法：
//   1. AI 檔案（MediaPipe 程式、AI 引擎、骨架模型）：版本固定、內容不會變，又很大（約 18 MB）
//      → 先用存起來的；沒有才下載，下載完整後存起來
//   2. 網站自己的檔案（網頁、程式、樣式）：可能隨時更新
//      → 有網路一定抓最新的（和沒有這個檔案時完全一樣）；只有斷網時才用上次存的
// 其他所有請求（鏡頭、別的網站）完全不經手
//
// 網址加 ?sw=0 打開一次，會移除這個 Service Worker 和存起來的檔案（js/offline.js）

const AI_CACHE = 'ai-files-v1';      // AI 檔案的版本變了（config.js 換 MediaPipe 版本）就換名字，舊的會被清掉
const SITE_CACHE = 'site-files-v1';
const AI_FILES = [
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@1\.0\.1\//,
    /^https:\/\/unpkg\.com\/@mediapipe\/tasks-vision@1\.0\.1\//,
    /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/pose_landmarker\//
];

// 網頁要移除離線功能（?sw=0）時會先通知：之後不再存任何檔案（還在下載中的也不存），並清掉已存的
let removed = false;
const OUR_CACHES = name => name.startsWith('ai-files-') || name.startsWith('site-files-');

self.addEventListener('message', event => {
    if (!event.data || event.data.type !== 'remove') return;
    removed = true;
    event.waitUntil(caches.keys().then(names => Promise.all(names.filter(OUR_CACHES).map(name => caches.delete(name)))));
});

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        // 清掉舊版本留下來的（只清自己的，同一個網域下別的程式存的不動）
        for (const name of await caches.keys()) {
            if (OUR_CACHES(name) && name !== AI_CACHE && name !== SITE_CACHE) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

// 重試時網址後面會加 ?retry=N（避免瀏覽器沿用卡住的下載）；存檔時去掉，重試也能用到存起來的
function aiKey(url) {
    const u = new URL(url);
    u.searchParams.delete('retry');
    return u.href;
}

// 網站檔案的網址後面有版本號 ?v=…；存檔時去掉，每個檔案只留最新的一份，不會越存越多
function siteKey(url) {
    const u = new URL(url);
    u.search = '';
    return u.href;
}

// 讀完整個回應再存：下載到一半斷掉的不會存進去
async function store(cacheName, key, response) {
    try {
        const body = await response.arrayBuffer();
        if (removed) return;
        const cache = await caches.open(cacheName);
        await cache.put(key, new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }));
    } catch (err) {
        // 存不了（例如空間不夠、無痕模式）也沒關係，下次再下載
    }
}

async function aiFile(request) {
    const key = aiKey(request.url);
    try {
        const hit = await caches.match(key, { cacheName: AI_CACHE });
        if (hit) return hit;
    } catch (err) {
        // 讀不到存起來的檔案：直接下載
    }
    // 背景執行緒用 importScripts 載入 MediaPipe 時，瀏覽器發出的是「不透明」請求（no-cors），內容讀不到、存不起來
    // 這些下載來源本來就允許跨網站讀取，所以改用一般（cors）方式重新請求，存得起來，也一樣能給 importScripts 用
    const response = await fetch(request.mode === 'no-cors' ? new Request(request.url, { mode: 'cors', credentials: 'omit' }) : request);
    if (response.ok && response.type !== 'opaque') store(AI_CACHE, key, response.clone());
    return response;
}

async function siteFile(request) {
    try {
        const response = await fetch(request);
        if (response.ok) store(SITE_CACHE, siteKey(request.url), response.clone());
        return response;
    } catch (err) {
        // 沒有網路：用上次存的
        const hit = await caches.match(siteKey(request.url), { cacheName: SITE_CACHE }).catch(() => null);
        if (hit) return hit;
        throw err;
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = request.url;
    if (AI_FILES.some(pattern => pattern.test(url))) {
        event.respondWith(aiFile(request));
    } else if (url.startsWith(self.registration.scope)) {
        event.respondWith(siteFile(request));
    }
});
