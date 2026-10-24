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

test('深蹲：腳跟比站直時往上移超過 14%（小腿長）算腳跟離地；腳跟沒動、移一點點、腳尖動都不算（10/24 改量法）', () => {
    // 示範動畫的小腿長（站直時，像素）：往上移多少用小腿長的幾分之幾表示
    const lm0 = demoLandmarks('squat', 0);
    const shank = Math.hypot((lm0[P.LEFT_KNEE].x - lm0[P.LEFT_ANKLE].x) * W, (lm0[P.LEFT_KNEE].y - lm0[P.LEFT_ANKLE].y) * H);
    const up = frac => -frac * shank / H;   // 往上移小腿長的 frac 倍（畫面座標往上是負的）
    assert.deepEqual(run('squat').seen, [], '腳跟一直貼地');
    assert.deepEqual(run('squat', (lm, d) => move(lm, both('HEEL'), 0, up(0.25) * d)).seen, ['heel'], '往上移 25%');
    assert.deepEqual(run('squat', (lm, d) => move(lm, both('HEEL'), 0, up(0.10) * d)).seen, [], '往上移 10%：不算');
    // 以前的量法（腳跟比腳尖高）：腳尖往下移，看起來就像腳跟比較高；現在不看腳尖
    assert.deepEqual(run('squat', (lm, d) => move(lm, both('FOOT_INDEX'), 0, -up(0.4) * d)).seen, [], '腳尖往下移不算');
});

test('腳跟的基準：每一下用開始前站直的那 1 秒；人換了位置（整個人往上、往下）下一下重新量；一開始就蹲著不判斷', () => {
    const lm0 = demoLandmarks('squat', 0);
    const shank = Math.hypot((lm0[P.LEFT_KNEE].x - lm0[P.LEFT_ANKLE].x) * W, (lm0[P.LEFT_KNEE].y - lm0[P.LEFT_ANKLE].y) * H);
    const all = lm0.map((_, i) => i);
    const pipeline = new PosePipeline(), checker = new FormChecker('squat');
    let t = 0;
    const seen = new Set();
    const step = (d, dy = 0) => {
        const out = checker.update(pipeline.process(move(demoLandmarks('squat', d), all, 0, dy), t += 33, W, H), t);
        out.errors.forEach(e => seen.add(e.id));
        return out;
    };
    let at = 0;
    // 站直時慢慢移到 dy（1 秒，一下子跳太多會被當成鬼骨架），再站 1 秒以上，蹲一下
    const rep = dy => {
        for (let i = 1; i <= 30; i++) step(0, at + (dy - at) * i / 30);
        at = dy;
        for (let i = 0; i < 40; i++) step(0, dy);
        for (let i = 0; i <= 30; i++) step(i / 30, dy);
        for (let i = 0; i < 20; i++) step(1, dy);
        for (let i = 30; i >= 0; i--) step(i / 30, dy);
    };
    rep(0);
    // 整個人往上移小腿長的 40%（手機被碰到、人往後站）：站直 1 秒以上再蹲，基準跟著換，不算腳跟離地
    rep(-0.4 * shank / H);
    rep(0.3 * shank / H);
    assert.deepEqual([...seen], [], '換位置不算');
    // 一開始就蹲著（前面沒有站直）：沒有基準，不判斷
    const fresh = new FormChecker('squat');
    const out = fresh.update(new PosePipeline().process(demoLandmarks('squat', 1), 33, W, H), 33);
    assert.equal(out.m.heel, null);
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
