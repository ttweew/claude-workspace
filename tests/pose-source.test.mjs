// 換模型的接口（js/ai/pose-source.js，11/21）：網站只透過這裡拿骨架；同一家換大小交給那一家，
// 換一家時先載入新的、成功才關掉舊的，失敗時舊的照常能用（錯誤標 recovered）。這裡用假的載入函式測
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { openSource } = await import('../js/ai/pose-source.js');

// 假的一家：記下發生了什麼
function fakeFamily(name, log, { fail = false } = {}) {
    return async (onProgress, attempt, key) => {
        log.push(name + ':load:' + key + ':' + attempt);
        onProgress({ stage: 'download', fraction: 0.5 });
        onProgress({ stage: 'start' });
        if (fail) throw new Error(name + ' 載入失敗');
        const d = {
            model: key, computeMode: name === 'mp' ? 'GPU' : 'CPU', computeDetail: name + ' 細節', gpuName: name + '-gpu',
            timings: { download: 1, start: 2, warmup: 3 }, background: true,
            async detect(video, t) { log.push(name + ':detect:' + t); return { landmarks: [name], world: null }; },
            lostReason: () => name + ':ok',
            async restart() { log.push(name + ':restart'); },
            async useModel(next, onFraction) { log.push(name + ':use:' + next); onFraction(1); d.model = next; },
            close() { log.push(name + ':close:' + d.model); }
        };
        return d;
    };
}
const families = { lite: 'mediapipe', full: 'mediapipe', 'yolo-n': 'yolo', 'yolo-s': 'yolo' };
const familyOf = k => (Object.prototype.hasOwnProperty.call(families, k) ? families[k] : '');

test('載入選的模型，偵測器的資料和功能都照轉', async () => {
    const log = [], progress = [];
    const src = await openSource('full', p => progress.push(p.stage), 2, { loaders: { mediapipe: fakeFamily('mp', log) }, familyOf });
    assert.deepEqual(log, ['mp:load:full:2']);
    assert.deepEqual(progress, ['download', 'start']);
    assert.equal(src.model, 'full');
    assert.equal(src.family, 'mediapipe');
    assert.equal(src.computeMode, 'GPU');
    assert.equal(src.computeDetail, 'mp 細節');
    assert.equal(src.gpuName, 'mp-gpu');
    assert.deepEqual(src.timings, { download: 1, start: 2, warmup: 3 });
    assert.equal(src.background, true);
    assert.deepEqual(await src.detect(null, 40), { landmarks: ['mp'], world: null });
    assert.equal(src.lostReason(), 'mp:ok');
    await src.restart();
    assert.deepEqual(log.slice(1), ['mp:detect:40', 'mp:restart']);
});

test('同一家換大小：交給那一家自己換', async () => {
    const log = [];
    const src = await openSource('lite', () => {}, 0, { loaders: { mediapipe: fakeFamily('mp', log) }, familyOf });
    let frac = null;
    await src.useModel('full', f => { frac = f; });
    assert.deepEqual(log, ['mp:load:lite:0', 'mp:use:full']);
    assert.equal(src.model, 'full');
    assert.equal(frac, 1);
});

test('換一家：先載入新的，成功了才關掉舊的；之後的偵測用新的；只回報下載的進度', async () => {
    const log = [], fractions = [];
    const src = await openSource('lite', () => {}, 0, { loaders: { mediapipe: fakeFamily('mp', log), yolo: fakeFamily('yolo', log) }, familyOf });
    await src.useModel('yolo-n', f => fractions.push(f));
    assert.deepEqual(log, ['mp:load:lite:0', 'yolo:load:yolo-n:0', 'mp:close:lite']);
    assert.deepEqual(fractions, [0.5]);
    assert.equal(src.model, 'yolo-n');
    assert.equal(src.family, 'yolo');
    assert.equal(src.computeMode, 'CPU');
    assert.deepEqual(await src.detect(null, 7), { landmarks: ['yolo'], world: null });
    await src.useModel('lite', () => {});
    assert.equal(src.model, 'lite');
    assert.ok(log.includes('yolo:close:yolo-n'), '換回來時關掉 YOLO');
});

test('換一家失敗：錯誤標 recovered，舊的照常能用、沒有被關掉', async () => {
    const log = [];
    const src = await openSource('lite', () => {}, 0, { loaders: { mediapipe: fakeFamily('mp', log), yolo: fakeFamily('yolo', log, { fail: true }) }, familyOf });
    await assert.rejects(src.useModel('yolo-s', () => {}), err => err.recovered === true && /yolo 載入失敗/.test(err.message));
    assert.equal(src.model, 'lite');
    assert.ok(!log.some(l => l.startsWith('mp:close')), '舊的沒有被關掉');
    assert.deepEqual(await src.detect(null, 1), { landmarks: ['mp'], world: null });
});

test('不認得的模型（網址、localStorage 被改過）：直接說不認得，不會拿去查物件', async () => {
    const log = [];
    const loaders = { mediapipe: fakeFamily('mp', log) };
    for (const bad of ['constructor', '__proto__', 'nope', 'toString']) {
        await assert.rejects(openSource(bad, () => {}, 0, { loaders, familyOf }), /不認得的骨架模型/);
    }
    // 有能力表、但還沒有載入方法的一家
    await assert.rejects(openSource('yolo-n', () => {}, 0, { loaders, familyOf }), /不認得的骨架模型/);
    assert.deepEqual(log, []);
});

test('關掉：交給現在的偵測器；關不掉（出錯）也不會往外丟', async () => {
    const log = [];
    const src = await openSource('lite', () => {}, 0, { loaders: { mediapipe: fakeFamily('mp', log) }, familyOf });
    src.close();
    assert.deepEqual(log, ['mp:load:lite:0', 'mp:close:lite']);
    const broken = await openSource('lite', () => {}, 0, {
        loaders: { mediapipe: async (p, a, key) => ({ model: key, close() { throw new Error('壞了'); } }) }, familyOf });
    const warn = console.warn;
    console.warn = () => {};
    try {
        assert.doesNotThrow(() => broken.close());
    } finally {
        console.warn = warn;
    }
});

test('真的載入方法：MediaPipe 的 lite、full 都接得上（沒有 YOLO 之前只有這一家）', async () => {
    const { PROFILES } = await import('../js/ai/models.js');
    for (const key of Object.keys(PROFILES)) {
        if (PROFILES[key].family !== 'mediapipe') continue;
        // 不真的載入：只確認這一家有載入方法（換成會立刻失敗的假網路，看錯誤不是「不認得」）
        await assert.rejects(openSource(key, () => {}, 0, { loaders: { mediapipe: async () => { throw new Error('假的網路錯誤'); } } }), /假的網路錯誤/);
    }
});

test('點畫面換人（11/22）：有這個功能的那一家（YOLO）轉過去、回傳 true；沒有的（MediaPipe）回傳 false；換一家之後跟著換', async () => {
    const log = [];
    const withFocus = (name) => async (onProgress, attempt, key) => {
        const d = await fakeFamily(name, log)(onProgress, attempt, key);
        d.focusAt = (x, y) => log.push(name + ':focus:' + x + ',' + y);
        return d;
    };
    const src = await openSource('lite', () => {}, 0, { loaders: { mediapipe: fakeFamily('mp', log), yolo: withFocus('yolo') }, familyOf });
    assert.equal(src.focusAt(0.5, 0.25), false, 'MediaPipe 一次只找一個人');
    await src.useModel('yolo-n', () => {});
    assert.equal(src.focusAt(0.5, 0.25), true);
    assert.ok(log.includes('yolo:focus:0.5,0.25'));
});
