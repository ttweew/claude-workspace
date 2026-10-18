// 動作錯誤判斷（js/analysis/form.js）：示範動畫的標準姿勢不誤報；改成常見的錯誤姿勢要抓得到
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../js/skeleton/landmarks.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { FormChecker, measure } from '../js/analysis/form.js';
import { demoLandmarks } from './helpers.mjs';

const W = 640, H = 480;
// 把幾個點移動（比例座標）
const move = (lm, ids, dx, dy) => lm.map((p, i) => (ids.includes(i) ? { ...p, x: p.x + dx, y: p.y + dy } : p));
const both = name => [P['LEFT_' + name], P['RIGHT_' + name]];

// 做一下（往下 → 停 → 往上），每一格可以改骨架；回傳出現過的錯誤和標紅的連線
function run(id, edit = lm => lm, { depth = 1 } = {}) {
    const pipeline = new PosePipeline();
    const checker = new FormChecker(id);
    let t = 0;
    const seen = new Set(), started = [], red = new Set();
    const step = d => {
        const pose = pipeline.process(edit(demoLandmarks(id, d), d), t += 33, W, H);
        const out = checker.update(pose, t);
        out.errors.forEach(e => seen.add(e.id));
        out.started.forEach(e => started.push(e.id));
        out.red.forEach(([a, b]) => red.add(a + '-' + b));
    };
    for (let i = 0; i < 20; i++) step(0);
    for (let i = 0; i <= 30; i++) step(depth * i / 30);
    for (let i = 0; i < 20; i++) step(depth);
    for (let i = 30; i >= 0; i--) step(depth * i / 30);
    for (let i = 0; i < 30; i++) step(0);
    return { seen: [...seen].sort(), started, red };
}

test('標準姿勢（示範動畫）：四個動作都不誤報', () => {
    for (const id of ['squat', 'pushup', 'plank', 'lunge']) assert.deepEqual(run(id).seen, [], id);
});

test('深蹲：上身前傾 60° 抓得到、標紅軀幹；站直時不看；只唸一次', () => {
    // 蹲下去時肩膀往前倒：越蹲越前傾（最低點約 65°）
    const lean = (lm, d) => {
        const hip = lm[P.LEFT_HIP];
        return lm.map((p, i) => {
            if (![...both('SHOULDER'), P.NOSE, ...both('EAR'), ...both('EYE'), ...both('ELBOW'), ...both('WRIST')].includes(i)) return p;
            const dx = (p.x - hip.x) * W, dy = (p.y - hip.y) * H;
            const a = d * 40 * Math.PI / 180;   // 再往前倒 40°（示範動畫本身最低點 30°）
            return { ...p, x: hip.x + (dx * Math.cos(a) - dy * Math.sin(a)) / W, y: hip.y + (dx * Math.sin(a) + dy * Math.cos(a)) / H };
        });
    };
    const r = run('squat', lean);
    assert.deepEqual(r.seen, ['lean']);
    assert.deepEqual(r.started, ['lean'], '出現一次就唸一次');
    assert.ok(r.red.has(P.LEFT_SHOULDER + '-' + P.LEFT_HIP), '軀幹標紅');
});

test('深蹲：腳跟離地（墊腳尖）抓得到', () => {
    const heel = (lm, d) => move(lm, both('HEEL'), 0, -0.06 * d);
    assert.deepEqual(run('squat', heel).seen, ['heel']);
});

test('伏地挺身、棒式：腰塌下去、屁股太高都抓得到；站著時不看', () => {
    for (const id of ['pushup', 'plank']) {
        assert.deepEqual(run(id, lm => move(lm, both('HIP'), 0, 0.05)).seen, ['sag'], id + ' 塌腰');
        assert.deepEqual(run(id, lm => move(lm, both('HIP'), 0, -0.07)).seen, ['pike'], id + ' 屁股翹');
    }
    // 站著（轉 90°）髖部往前推：不是趴著，不判斷
    const up = lm => move(lm, both('HIP'), 0, 0.05).map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
    assert.deepEqual(run('plank', up).seen, []);
});

test('弓箭步：前膝超過腳尖、上身前傾抓得到；前腳是面向那邊的腳', () => {
    // 最低點時前腳膝蓋往前推 0.06（超過腳尖）
    const knee = (lm, d) => move(lm, [P.LEFT_KNEE], 0.07 * d, 0);
    const r = run('lunge', knee);
    assert.deepEqual(r.seen, ['knee']);
    assert.ok(r.red.has(P.LEFT_KNEE + '-' + P.LEFT_ANKLE), '前腳小腿標紅');
    const m = measure(new PosePipeline().process(demoLandmarks('lunge', 1), 33, W, H));
    assert.equal(m.front, null, '第一格還看不出面向');
    const leanForward = (lm, d) => move(lm, [...both('SHOULDER'), P.NOSE, ...both('EAR'), ...both('EYE'), ...both('ELBOW'), ...both('WRIST')], 0.09 * d, 0.02 * d);
    assert.deepEqual(run('lunge', leanForward).seen, ['lean']);
});

test('一閃而過（0.2 秒）的錯誤不顯示', () => {
    const pipeline = new PosePipeline();
    const checker = new FormChecker('pushup');
    let t = 0, shown = false;
    for (let i = 0; i < 60; i++) {
        const lm = demoLandmarks('pushup', 0.5);
        const bad = i >= 30 && i < 36 ? move(lm, both('HIP'), 0, 0.05) : lm;
        if (checker.update(pipeline.process(bad, t += 33, W, H), t).errors.length) shown = true;
    }
    assert.equal(shown, false);
});
