// AI 模型的選擇（js/ai/model-choice.js）：預設、記住、自動的判斷結果、網址指定
import test from 'node:test';
import assert from 'node:assert/strict';

// 模擬瀏覽器的 localStorage 與網址；每次用新的網址參數重新載入模組
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
};
let loads = 0;
async function load(search = '') {
    globalThis.location = { search };
    // 網址參數在 config.js 載入時讀，所以 config.js 也要重新載入：兩個都加上不同的查詢字串
    const n = ++loads;
    const config = await import('../js/config.js?n=' + n);
    const src = (await import('node:fs')).readFileSync(new URL('../js/ai/model-choice.js', import.meta.url), 'utf8')
        .replace("from '../config.js'", "from '" + new URL('../js/config.js?n=' + n, import.meta.url).href + "'");
    return import('data:text/javascript,' + encodeURIComponent(src));
}

test('預設 lite；選了會記住', async () => {
    store.clear();
    let m = await load();
    assert.equal(m.getModelChoice(), 'lite');
    assert.equal(m.modelToLoad(), 'lite');
    m.setModelChoice('full');
    assert.equal(m.modelToLoad(), 'full');
    m = await load();
    assert.equal(m.getModelChoice(), 'full', '重新整理後還記得');
    m.setModelChoice('nope');
    assert.equal(m.getModelChoice(), 'full', '不認得的選項不理');
});

test('自動：先用 full；記住跟不上就用 lite；再選一次自動重新判斷', async () => {
    store.clear();
    let m = await load();
    m.setModelChoice('auto');
    assert.equal(m.modelToLoad(), 'full');
    assert.equal(m.autoRemembered(), false);
    m.rememberAutoModel('lite');
    assert.equal(m.modelToLoad(), 'lite');
    assert.equal(m.autoRemembered(), true);
    m = await load();
    assert.equal(m.modelToLoad(), 'lite', '下次打開直接用 lite');
    m.setModelChoice('full');
    assert.equal(m.modelToLoad(), 'full', '手動選 full 就用 full');
    m.setModelChoice('auto');
    assert.equal(m.modelToLoad(), 'full', '再選一次自動：忘掉記住的結果');
});

test('網址 ?model= 優先但不記住；不認得的參數不理', async () => {
    store.clear();
    let m = await load('?model=full');
    assert.equal(m.getModelChoice(), 'full');
    assert.equal(store.has('poseModel'), false);
    m = await load('?model=auto');
    assert.equal(m.modelToLoad(), 'full');
    m = await load('?model=heavy');
    assert.equal(m.getModelChoice(), 'lite');
});
