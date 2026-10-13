// 速度建議（js/ai/advisor.js）：量測的中位數、什麼情況給什麼建議
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVICE, SpeedMeter, advise, median } from '../js/ai/advisor.js';

const keys = m => advise(m).map(a => a.key);
const base = { msPerFrame: 20, aiFps: 30, cameraFps: 30, chosenFps: 30, cameraMax: 30, model: 'lite' };

test('中位數：偶爾一格特別慢不影響', () => {
    assert.equal(median([]), 0);
    assert.equal(median([12, 11, 500, 13, 12]), 12);
    assert.equal(median([10, 20]), 15);
});

test('量滿 8 秒、有每格耗時才算量完；沒有格數的秒不算', () => {
    const meter = new SpeedMeter();
    for (let i = 0; i < ADVICE.seconds - 1; i++) meter.addSecond(30, 30);
    meter.addSecond(0, 30);
    assert.equal(meter.ready, false);
    meter.addSecond(28, 30);
    assert.equal(meter.ready, false, '還沒有每格耗時');
    [11, 12, 13, 90].forEach(ms => meter.addFrame(ms));
    assert.equal(meter.ready, true);
    assert.deepEqual(meter.result(), { msPerFrame: 13, aiFps: 30, cameraFps: 30 });
    meter.reset();
    assert.equal(meter.ready, false);
});

test('剛好跟得上、沒有餘裕：不打擾', () => {
    assert.deepEqual(keys(base), []);
});

test('lite 很有餘裕：先建議 full，鏡頭能 60 格時再建議 60 格', () => {
    assert.deepEqual(keys({ ...base, msPerFrame: 8, cameraMax: 60 }), ['full', 'fps60']);
    // full 估計要 8×1.6＝12.8 毫秒，在一格 33 毫秒的 60% 以內
    assert.deepEqual(keys({ ...base, msPerFrame: 12 }), ['full']);
    // 13 毫秒 ×1.6＝20.8，超過 20 毫秒：不建議 full
    assert.deepEqual(keys({ ...base, msPerFrame: 13 }), []);
});

test('已經用 full、還有餘裕：只建議 60 格（鏡頭要能 60 格）', () => {
    assert.deepEqual(keys({ ...base, model: 'full', msPerFrame: 9, cameraMax: 60 }), ['fps60']);
    assert.deepEqual(keys({ ...base, model: 'full', msPerFrame: 9, cameraMax: 30 }), []);
    // 60 格的一格是 16.7 毫秒，要在 60%（10 毫秒）以內
    assert.deepEqual(keys({ ...base, model: 'full', msPerFrame: 11, cameraMax: 60 }), []);
});

test('筆電鏡頭最多 30 格、選了 120：跟得上就不建議改格數', () => {
    assert.deepEqual(keys({ ...base, chosenFps: 120, cameraMax: 30, msPerFrame: 15 }), []);
});

test('選 60 格跟不上：建議改回 30 格', () => {
    const list = advise({ ...base, chosenFps: 60, cameraFps: 60, cameraMax: 60, aiFps: 38, msPerFrame: 24 });
    assert.deepEqual(list.map(a => a.key), ['fps30-from-60']);
    assert.deepEqual(list[0].action, { fps: 30 });
    assert.match(list[0].text, /每秒只算到 38 格，跟不上鏡頭的 60 格/);
});

test('full 跟不上：建議改用 lite；非常慢時另外提醒', () => {
    assert.deepEqual(keys({ ...base, model: 'full', aiFps: 22, msPerFrame: 40 }), ['lite']);
    assert.deepEqual(keys({ ...base, model: 'full', aiFps: 12, msPerFrame: 80 }), ['lite', 'slow']);
    assert.deepEqual(advise({ ...base, model: 'full', aiFps: 22, msPerFrame: 40 })[0].action, { model: 'lite' });
});

test('lite 也很慢：沒有設定可以換，只提醒（沒有試試看按鈕）', () => {
    const list = advise({ ...base, aiFps: 14, msPerFrame: 70 });
    assert.deepEqual(list.map(a => a.key), ['slow']);
    assert.equal(list[0].button, null);
    assert.equal(list[0].action, null);
    // 稍微跟不上（每秒 24 格）但不到太慢：不打擾
    assert.deepEqual(keys({ ...base, aiFps: 24, msPerFrame: 38 }), []);
});
