// Service Worker（sw.js）：AI 檔案存進手機之前核對指紋（11/17 大翻查）
// sw.js 是給瀏覽器的一般程式（不是模組），這裡用 vm 在假的環境裡跑：假的 caches、fetch，真的 crypto（Node 內建）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const SCOPE = 'https://example.github.io/claude-workspace/';
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/';
const sha = text => createHash('sha256').update(text).digest('hex');

// 跑一份 sw.js：source 可以換掉清單裡的指紋（測試用的假檔案才對得上）
// 回傳 { fetchEvent(url, body)：模擬網頁要一個檔案，回傳 { response, stored（存了哪些）}, list：指紋清單 }
function load(source = SOURCE) {
    const handlers = {};
    const stores = new Map();   // 快取名稱 → Map(網址 → 內容)
    const caches = {
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const m = stores.get(name);
            return { async put(key, res) { m.set(String(key), await res.text()); } };
        },
        async match() { return undefined; },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); }
    };
    let body = '';
    const context = vm.createContext({
        self: { addEventListener: (type, fn) => { handlers[type] = fn; }, registration: { scope: SCOPE }, clients: { claim: async () => {} }, skipWaiting() {} },
        caches, crypto: globalThis.crypto, Response, Request, URL, console: { warn() {} },
        fetch: async () => new Response(body, { status: 200 })
    });
    vm.runInContext(source, context);
    return {
        list: vm.runInContext('AI_SHA256', context),
        cacheName: vm.runInContext('AI_CACHE', context),
        saved() {
            const out = {};
            for (const [name, m] of stores) out[name] = Object.fromEntries(m);
            return out;
        },
        async fetchEvent(url, text, { refuseWait = false } = {}) {
            body = text;
            const waits = [];
            let responded = null;
            const waitUntil = p => { if (refuseWait) throw new Error('InvalidStateError'); waits.push(p); };
            handlers.fetch({ request: new Request(url), respondWith: p => { responded = p; }, waitUntil });
            const response = await responded;
            const got = await response.text();
            await Promise.all(waits);
            const saved = {};
            for (const [name, m] of stores) saved[name] = Object.fromEntries(m);
            return { got, saved, waited: waits.length };
        }
    };
}

test('指紋清單：每個 MediaPipe 檔案、兩個骨架模型都有，格式是 64 個 16 進位字', () => {
    const { list, cacheName } = load();
    // config.js 的兩個模型（MODELS 的 name）
    const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
    const models = [...config.matchAll(/name: '(pose_landmarker_\w+)'/g)].map(m => m[1] + '.task');
    assert.deepEqual(models.sort(), ['pose_landmarker_full.task', 'pose_landmarker_lite.task']);
    for (const name of [...models, 'vision_bundle.mjs', 'vision_bundle.js', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm',
        'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
        assert.match(list[name] || '', /^[0-9a-f]{64}$/, name);
    }
    // 換了核對方式，快取名字也要換：以前沒核對過的不能留著用
    assert.notEqual(cacheName, 'ai-files-v1');
});

test('AI 檔案：指紋對才存；不對的照樣交給網頁、但不存；不在清單上的也不存', async () => {
    const good = 'console.log("真的檔案")';
    const sw = load(SOURCE.replace(/'vision_bundle\.mjs': '[0-9a-f]{64}'/, "'vision_bundle.mjs': '" + sha(good) + "'"));
    const url = CDN + 'vision_bundle.mjs';

    const ok = await sw.fetchEvent(url, good);
    assert.equal(ok.got, good);
    assert.equal(ok.saved[sw.cacheName][url], good, '指紋對：存起來');
    assert.ok(ok.waited >= 1, '存檔要用 waitUntil 撐住');

    const sw2 = load(SOURCE.replace(/'vision_bundle\.mjs': '[0-9a-f]{64}'/, "'vision_bundle.mjs': '" + sha(good) + "'"));
    const bad = await sw2.fetchEvent(url, 'alert("被改過")');
    assert.equal(bad.got, 'alert("被改過")', '這一次照樣交給網頁（和沒有 Service Worker 時一樣）');
    assert.equal((bad.saved[sw2.cacheName] || {})[url], undefined, '指紋不對：不存');

    const sw3 = load();
    const unknown = await sw3.fetchEvent(CDN + 'vision_bundle.mjs.map', '{}');
    assert.equal(unknown.got, '{}');
    assert.equal((unknown.saved[sw3.cacheName] || {})[CDN + 'vision_bundle.mjs.map'], undefined, '不在清單上：不存');

    // 重試時網址加的 ?retry=N 存檔時拿掉（指紋照樣核對）
    const sw4 = load(SOURCE.replace(/'vision_bundle\.mjs': '[0-9a-f]{64}'/, "'vision_bundle.mjs': '" + sha(good) + "'"));
    const retry = await sw4.fetchEvent(url + '?retry=2', good);
    assert.equal(retry.saved[sw4.cacheName][url], good);
});

test('瀏覽器不讓呼叫 waitUntil 時：檔案照樣給網頁、照樣存', async () => {
    const good = 'console.log("真的檔案")';
    const sw = load(SOURCE.replace(/'vision_bundle\.mjs': '[0-9a-f]{64}'/, "'vision_bundle.mjs': '" + sha(good) + "'"));
    const r = await sw.fetchEvent(CDN + 'vision_bundle.mjs', good, { refuseWait: true });
    assert.equal(r.got, good);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(sw.saved()[sw.cacheName][CDN + 'vision_bundle.mjs'], good);
});

test('網站自己的檔案：照舊存（去掉 ?v= 版本號），存檔也用 waitUntil 撐住', async () => {
    const sw = load();
    const r = await sw.fetchEvent(SCOPE + 'js/pages/main.js?v=1a2b3c4d', 'export {}');
    assert.equal(r.got, 'export {}');
    assert.equal(r.saved['site-files-v1'][SCOPE + 'js/pages/main.js'], 'export {}');
    assert.ok(r.waited >= 1);
});
