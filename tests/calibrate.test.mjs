// 個人校正（js/analysis/calibrate.js）：站直不動約 2 秒後記下站直的膝蓋角度、手機傾斜，計次和錯誤判斷跟著調整
import test from 'node:test';
import assert from 'node:assert/strict';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { Calibrator, personalThresholds } from '../js/analysis/calibrate.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { demoLandmarks } from './helpers.mjs';

const W = 640, H = 480;
// 整個畫面轉 deg 度（模擬手機放歪）：以畫面中心為圓心，用像素座標轉
const rotate = (lm, deg) => {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return lm.map(p => {
        const x = (p.x - 0.5) * W, y = (p.y - 0.5) * H;
        return { ...p, x: 0.5 + (x * c - y * s) / W, y: 0.5 + (x * s + y * c) / H };
    });
};
function feed(target, frames) {
    const pipeline = new PosePipeline();
    let t = 0, out = null;
    for (const lm of frames) out = target.update(pipeline.process(lm, t += 33, W, H), t) || out;
    return out;
}
const repeat = (lm, n) => Array(n).fill(lm);

test('站直不動 1.5 秒：記下站直的膝蓋角度和手機傾斜；一直動、正面拍不校正', () => {
    const stand = demoLandmarks('squat', 0);
    const b = feed(new Calibrator(), repeat(stand, 60));
    assert.ok(b && Math.abs(b.knee - 168) <= 2, '膝蓋 ' + (b && b.knee));
    // 手機沒有歪：量到的是腿（髖部中心 → 兩腳踝中間）約 −2°，不是上身的 6°（站直時上身本來就有一點前傾，不能當成手機歪）
    assert.ok(Math.abs(b.tilt) <= 3, '手機沒有歪，量到 ' + b.tilt);
    // 一直在蹲（不是站著不動）
    const moving = Array.from({ length: 90 }, (_, i) => demoLandmarks('squat', 0.5 + 0.5 * Math.sin(i / 5)));
    assert.equal(feed(new Calibrator(), moving), null);
    assert.equal(feed(new Calibrator(), repeat(demoLandmarks('squat', 0, { yaw: 1 }), 90)), null, '正面拍');
});

test('站直的門檻：站直只有 165° → 門檻降到 155°；站得很直維持 160°；最低 145°', () => {
    const squat = { up: 160, down: 140 };
    assert.deepEqual(personalThresholds(squat, { knee: 165 }), { up: 155, down: 140 });
    assert.deepEqual(personalThresholds(squat, { knee: 178 }), { up: 160, down: 140 });
    assert.deepEqual(personalThresholds(squat, { knee: 150 }), { up: 145, down: 130 });
    assert.deepEqual(personalThresholds(squat, null), { up: 160, down: 140 });
});

test('手機放得高、站直時膝蓋看起來只有 158°：校正前一下都算不到，校正後都算到', () => {
    // 深度 0.12 時膝蓋約 158°：當作這個人「站直」的樣子
    const frames = [...repeat(demoLandmarks('squat', 0.12), 60)];
    for (let k = 0; k < 3; k++) {
        for (let i = 0; i <= 30; i++) frames.push(demoLandmarks('squat', 0.12 + 0.88 * i / 30));
        for (let i = 30; i >= 0; i--) frames.push(demoLandmarks('squat', 0.12 + 0.88 * i / 30));
        frames.push(...repeat(demoLandmarks('squat', 0.12), 20));
    }
    const tracker = new WorkoutTracker('squat');
    feed(tracker, frames);
    assert.equal(tracker.items.length, 3, '校正後算到 3 下');
    assert.ok(tracker.baseline && tracker.baseline.knee <= 160, '校正 ' + JSON.stringify(tracker.baseline));
    // 不讓它校正（一開始就開始蹲，沒有站著不動）：門檻維持 160°，一下都算不到
    const noCal = new WorkoutTracker('squat');
    feed(noCal, frames.slice(60));
    assert.equal(noCal.items.length, 0);
});

test('沿用錄製檔記下的校正結果（重播分析）：門檻和前傾的判斷馬上調整；格式不對不用', () => {
    const t = new WorkoutTracker('squat');
    assert.equal(t.useBaseline({ knee: 158, tilt: 12 }), true);
    assert.deepEqual({ up: t.counter.config.up, down: t.counter.config.down }, { up: 148, down: 133 });
    assert.equal(t.form.tilt, 12);
    for (const bad of [null, {}, { knee: '158', tilt: 0 }, { knee: 158 }, { knee: NaN, tilt: 0 }]) {
        const u = new WorkoutTracker('squat');
        assert.equal(u.useBaseline(bad), false, JSON.stringify(bad));
        assert.equal(u.counter.config.up, 160);
    }
    assert.equal(new WorkoutTracker('pushup').useBaseline({ knee: 158, tilt: 0 }), false, '伏地挺身不校正');
});

test('手機放歪 12°：校正前蹲下時誤判「上身太前傾」，校正後不會', () => {
    // 比示範動畫多前傾 10°（最低點 40°，沒有超過 50°），整個畫面再歪 12°
    const P = { L: 11, R: 12 };
    const leanMore = (lm, d) => {
        const hip = lm[23];
        return lm.map((p, i) => {
            if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].includes(i)) return p;
            const dx = (p.x - hip.x) * W, dy = (p.y - hip.y) * H, a = d * 10 * Math.PI / 180;
            return { ...p, x: hip.x + (dx * Math.cos(a) - dy * Math.sin(a)) / W, y: hip.y + (dx * Math.sin(a) + dy * Math.cos(a)) / H };
        });
    };
    const frame = d => rotate(leanMore(demoLandmarks('squat', d), d), 12);
    const reps = [];
    for (let k = 0; k < 2; k++) {
        for (let i = 0; i <= 30; i++) reps.push(frame(i / 30));
        reps.push(...repeat(frame(1), 15));
        for (let i = 30; i >= 0; i--) reps.push(frame(i / 30));
        reps.push(...repeat(frame(0), 20));
    }
    const before = new WorkoutTracker('squat');
    feed(before, reps);
    const after = new WorkoutTracker('squat');
    feed(after, [...repeat(frame(0), 60), ...reps]);
    assert.ok(after.baseline && Math.abs(Math.abs(after.baseline.tilt) - 12) <= 3, '量到手機歪約 12°：' + JSON.stringify(after.baseline));
    assert.ok(before.items.some(r => r.errors.includes('lean')), '校正前誤判前傾：' + JSON.stringify(before.items.map(r => r.errors)));
    assert.ok(after.items.length === 2 && after.items.every(r => !r.errors.includes('lean')), '校正後不誤判：' + JSON.stringify(after.items.map(r => r.errors)));
    // 校正好之後 AI 漏掉幾格（看不到人）：手機歪的角度還要記得（10/24 安全複查：以前清成 0，之後一直誤判前傾）
    const missed = new WorkoutTracker('squat');
    feed(missed, [...repeat(frame(0), 60), null, null, ...repeat(frame(0), 20), ...reps]);
    assert.ok(missed.baseline && Math.abs(missed.form.tilt - missed.baseline.tilt) < 1e-9, '還記得手機歪幾度：' + missed.form.tilt);
    assert.ok(missed.items.length === 2 && missed.items.every(r => !r.errors.includes('lean')), '漏掉幾格之後也不誤判：' + JSON.stringify(missed.items.map(r => r.errors)));
});

test('站姿本來就前傾的人：手機沒歪時不扣上身的角度，前傾一樣判斷得出來', () => {
    // 整個上半身多前傾 12°（站直時就是這樣），手機放正
    const W = 640, H = 480;
    const leanUpper = (lm, deg) => {
        const hip = lm[23], a = deg * Math.PI / 180;
        return lm.map((p, i) => (i > 22 ? p : { ...p,
            x: hip.x + ((p.x - hip.x) * W * Math.cos(a) - (p.y - hip.y) * H * Math.sin(a)) / W,
            y: hip.y + ((p.x - hip.x) * W * Math.sin(a) + (p.y - hip.y) * H * Math.cos(a)) / H }));
    };
    const b = feed(new Calibrator(), repeat(leanUpper(demoLandmarks('squat', 0), 12), 60));
    assert.ok(b, '上身前傾 12° 還算站直，可以校正');
    assert.ok(Math.abs(b.tilt) <= 3, '手機傾斜量的是腿：' + b.tilt);
});
