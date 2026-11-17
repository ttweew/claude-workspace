// Service Worker：把 AI 檔案存在手機裡，第二次打開不用再下載，沒有網路也能用
//
// 兩種檔案、兩種做法：
//   1. AI 檔案（MediaPipe 程式、AI 引擎、骨架模型）：版本固定、內容不會變，又很大（約 18 MB）
//      → 先用存起來的；沒有才下載，下載完整後存起來
//   2. 網站自己的檔案（網頁、程式、樣式）：可能隨時更新
//      → 有網路一定抓最新的（和沒有這個檔案時完全一樣）；只有斷網時才用上次存的
// 其他所有請求（鏡頭、別的網站）完全不經手
//
// 網址加 ?sw=0 打開一次，會移除這個 Service Worker 和存起來的檔案（js/platform/offline.js）

// AI 檔案的版本變了（config.js 換 MediaPipe 版本）就換名字，舊的會被清掉
// v2（11/17 大翻查）：開始核對檔案指紋；以前（v1）沒核對過就存的全部清掉，重新下載一次（約 18 MB）
const AI_CACHE = 'ai-files-v2';
const SITE_CACHE = 'site-files-v1';
const AI_FILES = [
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@1\.0\.1\//,
    /^https:\/\/unpkg\.com\/@mediapipe\/tasks-vision@1\.0\.1\//,
    /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/pose_landmarker\//
];

// AI 檔案的指紋（SHA-256）：存進手機之前先核對，內容和下面一模一樣才存（11/17 大翻查）
// 為什麼：AI 檔案存起來之後，之後每次打開（包括沒網路時）都直接用存的；萬一某一次下載到被改過、壞掉的檔案
//   （下載來源被入侵、中間出錯），沒核對就會一直用下去。核對不對的這一次照樣交給網頁（和沒有這個檔案時一樣），只是不存
// 怎麼來的：npm 上 @mediapipe/tasks-vision@1.0.1 套件裡的檔案（jsDelivr、unpkg 兩個來源給的就是這個套件的檔案），
//   骨架模型是 Google 下載網址上的檔案（11/17 下載下來核對過，和回歸測試用的複本一樣）
// 換 MediaPipe 版本或模型時要重算（sha256sum 每個檔案），不然新的檔案都不會存（還是能用，只是每次都要重新下載）
const AI_SHA256 = {
    'vision_bundle.mjs': 'd885630c297c0b20b1fe86096cb06291c4c8080876f27852e724f24ac603713f',
    'vision_bundle.js': '98db72469ffb176f5e9f2687be0f70783893aca681f7789c34b872b0a764371a',
    'vision_wasm_internal.js': 'e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73',
    'vision_wasm_internal.wasm': '8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886',
    'vision_wasm_module_internal.js': 'da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d',
    'vision_wasm_module_internal.wasm': '2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b',
    'vision_wasm_nosimd_internal.js': 'e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658',
    'vision_wasm_nosimd_internal.wasm': 'a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192',
    'pose_landmarker_lite.task': '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
    'pose_landmarker_full.task': '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1'
};

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

// 檔案的指紋（SHA-256，16 進位）
async function sha256(body) {
    const digest = await crypto.subtle.digest('SHA-256', body);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 存檔交給 event.waitUntil 撐住（回應交給網頁之後，瀏覽器可能就把 Service Worker 停掉，約 9 MB 的 AI 引擎會存到一半）
// 萬一這個瀏覽器在這個時間點不讓呼叫 waitUntil（會丟出錯誤）：照樣存，只是沒撐住；不能因為這樣讓網頁拿不到檔案
function keep(event, promise) {
    try {
        event.waitUntil(promise);
    } catch (err) {
        // promise 照樣在跑
    }
}

// 讀完整個回應再存：下載到一半斷掉的不會存進去
// sha：要核對的指紋（AI 檔案）；不一樣（或不在清單上）就不存
async function store(cacheName, key, response, sha = null) {
    try {
        const body = await response.arrayBuffer();
        if (removed) return;
        if (cacheName === AI_CACHE && (!sha || await sha256(body) !== sha)) {
            console.warn('AI 檔案的指紋不對（或不在清單上），不存進手機：', key);
            return;
        }
        const cache = await caches.open(cacheName);
        await cache.put(key, new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }));
    } catch (err) {
        // 存不了（例如空間不夠、無痕模式）也沒關係，下次再下載
    }
}

async function aiFile(event) {
    const request = event.request;
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
    if (response.ok && response.type !== 'opaque') {
        const name = new URL(key).pathname.split('/').pop();
        const sha = Object.prototype.hasOwnProperty.call(AI_SHA256, name) ? AI_SHA256[name] : null;
        keep(event, store(AI_CACHE, key, response.clone(), sha));
    }
    return response;
}

async function siteFile(event) {
    const request = event.request;
    try {
        const response = await fetch(request);
        if (response.ok) keep(event, store(SITE_CACHE, siteKey(request.url), response.clone()));
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
        event.respondWith(aiFile(event));
    } else if (url.startsWith(self.registration.scope)) {
        event.respondWith(siteFile(event));
    }
});
