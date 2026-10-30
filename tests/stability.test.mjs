// 動作穩定度（js/analysis/stability.js，10/30）：深蹲、弓箭步每一下重心前後晃動，棒式髖部上下晃動
import test from 'node:test';
import assert from 'node:assert/strict';
import { STABILITY, stabilityValue, repSway, holdSway, stabilityOf, stabilityLine } from '../js/analysis/stability.js';
import { repSeries } from '../js/analysis/rep-series.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { P } from '../js/skeleton/landmarks.js';
import { demoLandmarks, random } from './helpers.mjs';

const W = 640, H = 480;

// 示範動畫走一遍 WorkoutTracker（和鏡頭畫面一樣）：站直 2 秒 → 3 下（下去、起來各 30 格）
// noise：每個點加減幾像素的雜訊；rock：整個人（腳不動）每秒前後晃一次，晃幾像素
function doReps(id, { noise = 0, rock = 0, reps = 3 } = {}) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker(id), rnd = random(3);
    let t = 0, k = 0;
    const done = [];
    const feed = depth => {
        const dx = rock / W * Math.sin(k++ / 30 * 2 * Math.PI);
        const lm = demoLandmarks(id, depth).map((p, i) => ({ ...p, x: p.x + (i < 25 ? dx : 0) + (rnd() - 0.5) * 2 * noise / W, y: p.y + (rnd() - 0.5) * 2 * noise / H }));
        const r = tracker.update(pipeline.process(lm, t, W, H), t);
        if (r.done) done.push(r.done);
        t += 33;
    };
    for (let i = 0; i < 60; i++) feed(0);
    for (let r = 0; r < reps; r++) {
        for (let i = 0; i <= 30; i++) feed(i / 30);
        for (let i = 30; i >= 0; i--) feed(i / 30);
        for (let i = 0; i < 20; i++) feed(0);
    }
    return done;
}

// 棒式撐 secs 秒再起身；wobble(i)：第 i 格髖部往下移多少（比例座標）
function doPlank(secs, wobble = () => 0) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker('plank');
    let t = 0, done = null;
    const n = secs * 30;
    for (let i = 0; i < n + 150; i++) {
        const up = i >= n;
        const lm = (up ? demoLandmarks('squat', 0) : demoLandmarks('plank', 0))
            .map((p, k) => (!up && (k === P.LEFT_HIP || k === P.RIGHT_HIP) ? { ...p, y: p.y + wobble(i) } : p));
        const r = tracker.update(pipeline.process(lm, t, W, H), t);
        if (r.done) done = r.done;
        t += 33;
    }
    return done;
}

test('示範動畫（標準動作、完全不晃）：深蹲、弓箭步每一下的重心前後晃動就是 STABILITY.REFERENCE（總結寫的「示範動畫幾 %」）', () => {
    for (const id of ['squat', 'lunge']) {
        const reps = doReps(id);
        assert.equal(reps.length, 3, id);
        assert.deepEqual(reps.map(r => r.sway), [STABILITY.REFERENCE[id], STABILITY.REFERENCE[id], STABILITY.REFERENCE[id]], id);
        assert.equal(reps[0].samples, undefined, '算完不留曲線');
    }
});

test('前後晃得越多數字越大；±1 像素的雜訊（AI 的點本來就會抖）差不到 0.2%', () => {
    for (const id of ['squat', 'lunge']) {
        const ref = STABILITY.REFERENCE[id];
        for (const r of doReps(id, { noise: 1 })) assert.ok(Math.abs(r.sway - ref) <= 0.2, id + ' 雜訊 ' + r.sway);
        const six = doReps(id, { rock: 6.4 }).map(r => r.sway), thirteen = doReps(id, { rock: 12.8 }).map(r => r.sway);
        for (let i = 0; i < 3; i++) {
            assert.ok(six[i] >= ref + 1, id + ' 晃 ±6 像素：' + six);
            assert.ok(thirteen[i] >= six[i] + 2, id + ' 晃 ±13 像素：' + thirteen + ' vs ' + six);
        }
    }
});

test('棒式：撐得穩 ±0°；髖部上下晃越多數字越大；慢慢塌下去不算晃動、寫在髖部的位置', () => {
    const still = doPlank(20);
    assert.equal(still.sway, 0);
    const wobble = a => i => a * Math.sin(i / 30 * 2 * Math.PI * 0.7);
    const small = doPlank(20, wobble(0.005)), big = doPlank(20, wobble(0.01));
    assert.ok(small.sway >= 1 && big.sway >= small.sway * 1.8, small.sway + ' → ' + big.sway);
    // 30 秒裡髖部慢慢往下 0.04（約 19 像素）：每 2 秒的晃動很小，位置從前段到後段往下
    const sag = doPlank(30, i => 0.04 * i / 900);
    assert.ok(sag.sway <= 0.5, '慢慢塌不算晃動：' + sag.sway);
    assert.ok(sag.levelBack - sag.levelFront >= 3, '位置往下：' + sag.levelFront + ' → ' + sag.levelBack);
    // 後半段才開始晃：後段比前段大
    const late = doPlank(30, i => (i > 450 ? 0.01 * Math.sin(i / 30 * 2 * Math.PI * 0.7) : 0));
    assert.ok(late.swayFront <= 0.2 && late.swayBack >= 2, late.swayFront + ' → ' + late.swayBack);
    // 撐不到 12 秒：只有整次的晃動，不比前段、後段
    const short = doPlank(10, wobble(0.005));
    assert.ok(short.sway > 0 && short.swayFront === null && short.levelBack === null, JSON.stringify(short));
});

test('不看的、算不出來的：伏地挺身、自由模式、沒有人；一下不到 10 格；棒式每 2 秒不到 5 格的那段不算', () => {
    assert.equal(stabilityValue('pushup', { landmarks: [] }), null);
    assert.equal(stabilityValue('free', { landmarks: [] }), null);
    assert.equal(stabilityValue('squat', null), null);
    assert.equal(repSway([1, 2, 3, 4, 5, 6, 7, 8, 9]), null);
    assert.equal(repSway(Array(10).fill(5)), 0);
    assert.equal(holdSway([]), null);
    // 每 2 秒只有 4 格（手機很慢）：一段都不算
    assert.equal(holdSway(Array.from({ length: 20 }, (_, i) => ({ t: i * 500, v: i % 2 }))), null);
    assert.equal(new WorkoutTracker('pushup').stability.take().sway, undefined, '伏地挺身不記');
});

// 一組：每一下的重心前後晃動
const set = list => list.map((sway, i) => ({ min: 85, depth: 'good', start: i * 3, end: i * 3 + 2, errors: [], sway }));

test('總結的那一句：平均、最多的是第幾下、示範動畫的數字；6 下以上比前段、後段', () => {
    const s = stabilityOf(repSeries('squat', set([2.1, 2.3, 2.2, 2.4, 3.9, 4.3])), 'squat');
    assert.deepEqual(s.front, { from: 1, to: 2, sway: 2.2 });
    assert.deepEqual(s.back, { from: 5, to: 6, sway: 4.1 });
    assert.equal(stabilityLine(s), '動作穩定度：重心前後晃動平均 2.9%（小腿長 100%；示範動畫 2.3%），最多的是第 6 下（4.3%）；前段（第 1～2 下）2.2% → 後段（第 5～6 下）4.1%');
    const few = stabilityOf(repSeries('lunge', set([2.5, 3.1])), 'lunge');
    assert.equal(stabilityLine(few), '動作穩定度：重心前後晃動平均 2.8%（小腿長 100%；示範動畫 2.7%），最多的是第 2 下（3.1%）；做 6 下以上才比前段、後段');
    // 只有 1 下：不寫「最多的是」
    assert.ok(!stabilityLine(stabilityOf(repSeries('squat', set([2.5])), 'squat')).includes('最多'));
    // 伏地挺身（沒有晃動的數字）：沒有這一句
    assert.equal(stabilityOf(repSeries('pushup', set([null, null])), 'pushup'), null);
    assert.equal(stabilityLine(null), '');
});

test('棒式的那一句：看最久的那一次；撐不到 12 秒寫要撐久一點', () => {
    const holds = [{ seconds: 8.4, errors: [], sway: 1.1, swayFront: null, swayBack: null, levelFront: null, levelBack: null },
        { seconds: 30.9, errors: [], sway: 0.9, swayFront: 0.6, swayBack: 1.4, levelFront: 1.2, levelBack: 5.3 }];
    assert.equal(stabilityLine(stabilityOf(repSeries('plank', holds), 'plank')),
        '動作穩定度：髖部上下晃動 ±0.9°（第 2 次，撐 30 秒）；前段 ±0.6° → 後段 ±1.4°；髖部的位置 前段往下彎 1.2° → 後段往下彎 5.3°');
    assert.equal(stabilityLine(stabilityOf(repSeries('plank', [holds[0]]), 'plank')),
        '動作穩定度：髖部上下晃動 ±1.1°（第 1 次，撐 8 秒）；撐 12 秒以上才比前段、後段');
    const up = [{ ...holds[1], levelFront: 0, levelBack: -2.5 }];
    assert.ok(stabilityLine(stabilityOf(repSeries('plank', up), 'plank')).endsWith('髖部的位置 前段一直線 → 後段往上翹 2.5°'));
});

test('被改過的資料：晃動不是範圍裡的數字就不算', () => {
    const s = repSeries('squat', set([2.1, 'x', -1, 1000, NaN, 2.5]));
    assert.deepEqual(s.reps.map(r => r.sway), [2.1, null, null, null, null, 2.5]);
    const h = repSeries('plank', [{ seconds: 20, errors: [], sway: 99, swayFront: '1', swayBack: -3, levelFront: 200, levelBack: -2 }]);
    assert.deepEqual([h.holds[0].sway, h.holds[0].swayFront, h.holds[0].swayBack, h.holds[0].levelFront, h.holds[0].levelBack], [null, null, null, null, -2]);
    assert.equal(stabilityOf(h, 'plank'), null, '晃動算不出來就沒有這一句');
});
