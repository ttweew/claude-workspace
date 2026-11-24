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

test('YOLO（11/21）：選了會記住、網址也能指定；自動只在 MediaPipe 裡選', async () => {
    store.clear();
    let m = await load();
    m.setModelChoice('yolo-n');
    assert.equal(m.modelToLoad(), 'yolo-n');
    m = await load();
    assert.equal(m.getModelChoice(), 'yolo-n', '重新整理後還記得');
    m = await load('?model=yolo-s');
    assert.equal(m.modelToLoad(), 'yolo-s');
    m.setModelChoice('auto');
    assert.equal(m.modelToLoad(), 'full', '自動：還是先用 MediaPipe full');
    m = await load('?model=yolo-x');
    assert.equal(m.getModelChoice(), 'auto', '不認得的網址參數不理（用記住的）');
});

test('首頁選好動作後的「用哪一個 AI」（11/24）：只選哪一家；換回來時用那一家上次選的大小，沒選過用最快的', async () => {
    store.clear();
    let m = await load();
    assert.deepEqual(m.FAMILIES, ['mediapipe', 'yolo']);
    assert.equal(m.choiceForFamily('mediapipe'), 'lite', '現在就是這一家：不變');
    assert.equal(m.choiceForFamily('yolo'), 'yolo-n', '沒選過 YOLO：最快的 26n');
    m.setModelChoice('full');   // 進階設定選了 full
    m.setModelChoice(m.choiceForFamily('yolo'));
    assert.equal(m.getModelChoice(), 'yolo-n');
    assert.equal(m.choiceForFamily('mediapipe'), 'full', '換回 MediaPipe 還是 full，不會變回 lite');
    m.setModelChoice('yolo-s');
    m.setModelChoice(m.choiceForFamily('mediapipe'));
    m = await load();
    assert.equal(m.getModelChoice(), 'full', '重新整理後還記得');
    assert.equal(m.choiceForFamily('yolo'), 'yolo-s', 'YOLO 上次選的 26s 也記得');
    m.setModelChoice('auto');
    m.setModelChoice('yolo-n');
    assert.equal(m.choiceForFamily('mediapipe'), 'auto');
    assert.equal(m.familyOfChoice('auto'), 'mediapipe');
    assert.equal(m.familyOfChoice('yolo-s'), 'yolo');
});

test('「用哪一個 AI」：存的資料、家的名字被改過時不會拿去查物件', async () => {
    store.clear();
    store.set('lastModel.yolo', 'lite');            // 別家的
    store.set('lastModel.mediapipe', 'constructor');
    const m = await load();
    assert.equal(m.choiceForFamily('yolo'), 'yolo-n');
    assert.equal(m.choiceForFamily('mediapipe'), 'lite');
    for (const bad of ['constructor', '__proto__', 'toString', '', null, undefined, 'YOLO']) {
        assert.equal(m.choiceForFamily(bad), null, String(bad));
        assert.equal(m.familyOfChoice(bad), '', String(bad));
    }
    assert.equal(m.getModelChoice(), 'lite', '查不認得的家不會改到現在的選擇');
});
