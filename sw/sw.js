const CACHE = 'ai-files-v1';
const KEEP = [/^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision@1\.0\.1\//, /^https:\/\/unpkg\.com\/@mediapipe\/tasks-vision@1\.0\.1\//, /^https:\/\/storage\.googleapis\.com\/mediapipe-models\//];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
const keyOf = url => { const u = new URL(url); u.searchParams.delete('retry'); return u.href; };
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET' || !KEEP.some(r => r.test(url))) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = keyOf(url);
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) { const copy = res.clone(); copy.arrayBuffer().then(buf => cache.put(key, new Response(buf, { headers: res.headers }))).catch(() => {}); }
    return res;
  })());
});
