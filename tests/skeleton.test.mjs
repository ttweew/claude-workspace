// 骨架處理（js/skeleton/）：平滑、擋鬼點、整條處理流程、公尺座標穩定化
import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseSmoother } from '../js/skeleton/smooth.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { WorldStabilizer } from '../js/skeleton/world.js';
import { angleAt } from '../js/analysis/angles.js';
import { demoFrames, random, meanStep } from './helpers.mjs';

const W = 640, H = 480;

test('平滑：站著不動時，抖動明顯變小', () => {
    const frames = demoFrames({ depths: [], lead: 4, noisePx: 2 });
    const smoother = new PoseSmoother();
    const raw = [], smooth = [];
    for (const f of frames) {
        raw.push(f.raw[25].x * W);
        smooth.push(smoother.smooth(f.raw, f.t)[25].x * W);
    }
    assert.ok(meanStep(smooth) < meanStep(raw) * 0.5, `原始 ${meanStep(raw).toFixed(2)}、平滑 ${meanStep(smooth).toFixed(2)} 像素`);
});

test('平滑：壞掉的數字（NaN、無限大、10 億）沿用上一個值，不會一直壞下去', () => {
    const frames = demoFrames({ depths: [], lead: 1 });
    const smoother = new PoseSmoother();
    smoother.smooth(frames[0].raw, frames[0].t);
    smoother.smooth(frames[1].raw, frames[1].t);
    [NaN, Infinity, 1e9].forEach((bad, k) => {
        const f = frames[2 + k];
        const raw = f.raw.map(p => ({ ...p }));
        raw[25].x = bad;
        const out = smoother.smooth(raw, f.t);
        assert.ok(Number.isFinite(out[25].x) && Math.abs(out[25].x) < 2, '壞掉的值：' + bad);
    });
    const after = smoother.smooth(frames[5].raw, frames[5].t);
    assert.ok(after.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('平滑：點的數量改變時自動重新開始，不會出錯', () => {
    const frames = demoFrames({ depths: [], lead: 1 });
    const smoother = new PoseSmoother();
    smoother.smooth(frames[0].raw, frames[0].t);
    const out = smoother.smooth(frames[1].raw.slice(0, 20), frames[1].t);
    assert.equal(out.length, 20);
});

test('處理流程：亂七八糟的輸入不會當掉，正常資料回來後能再認出人', () => {
    const rand = random(7);
    const frames = demoFrames({ depths: [90], lead: 1 });
    const pipeline = new PosePipeline();
    let t = 0;
    for (let i = 0; i < 3000; i++) {
        t += 33;
        const kind = Math.floor(rand() * 5);
        const raw = kind === 0 ? null : Array.from({ length: 33 }, () => ({
            x: kind === 1 ? NaN : kind === 2 ? rand() * 1e9 : rand(),
            y: kind === 3 ? Infinity : rand(),
            z: rand(),
            visibility: rand()
        }));
        pipeline.process(raw, t, W, H);
    }
    let found = false;
    for (const f of frames) if (pipeline.process(f.raw, t + 1000 + f.t, W, H)) found = true;
    assert.ok(found);
});

test('處理流程：側面拍的深蹲，角度和拍攝方向都算得出來', () => {
    const pipeline = new PosePipeline();
    let last = null;
    for (const f of demoFrames({ yaw: 5 })) last = pipeline.process(f.raw, f.t, W, H) || last;
    assert.ok(last);
    assert.equal(last.view.view, 'side');
    assert.ok(last.angles.LEFT_KNEE > 160, '站直時膝蓋接近伸直：' + last.angles.LEFT_KNEE);
});

test('公尺座標穩定化：位置比原始資料更接近真實位置', () => {
    const truth = demoFrames({ worldNoise: 0, seed: 3 });
    const noisy = demoFrames({ worldNoise: 0.04, seed: 3 });
    const stabilizer = new WorldStabilizer();
    let rawErr = 0, stableErr = 0, n = 0;
    noisy.forEach((f, i) => {
        if (!f.world) return;
        const out = stabilizer.process(f.world, f.t);
        for (const j of [23, 25, 27]) {
            const q = truth[i].world[j];
            rawErr += Math.hypot(f.world[j].x - q.x, f.world[j].y - q.y, f.world[j].z - q.z);
            stableErr += Math.hypot(out[j].x - q.x, out[j].y - q.y, out[j].z - q.z);
            n++;
        }
    });
    assert.ok(stableErr < rawErr * 0.9, `原始 ${(rawErr / n * 100).toFixed(2)} 公分、處理後 ${(stableErr / n * 100).toFixed(2)} 公分`);
});

test('公尺座標穩定化：不會改到原始資料；時間倒退時重新開始', () => {
    const frames = demoFrames({ depths: [90] }).filter(f => f.world);
    const stabilizer = new WorldStabilizer();
    const copy = JSON.stringify(frames[0].world);
    stabilizer.process(frames[0].world, frames[0].t);
    stabilizer.process(frames[1].world, frames[1].t);
    assert.equal(JSON.stringify(frames[0].world), copy);
    const back = stabilizer.process(frames[50].world, 0);
    assert.deepEqual(back, frames[50].world.map(p => ({ ...p })), '重新開始的第一格就是原始值');
});

test('公尺座標穩定化：骨頭長度限制真的有幫助（比只做平滑更接近真實的膝蓋角度）', () => {
    // 只做平滑、不限制骨頭長度的版本，當作比較基準
    class SmoothOnly extends WorldStabilizer {
        limitBones() {}
    }
    let fullErr = 0, smoothErr = 0, n = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const truth = demoFrames({ worldNoise: 0, seed, yaw: 20 });
        const noisy = demoFrames({ worldNoise: 0.05, seed, yaw: 20 });
        const full = new WorldStabilizer(), smooth = new SmoothOnly();
        noisy.forEach((f, i) => {
            if (!f.world) return;
            const a = full.process(f.world, f.t), b = smooth.process(f.world, f.t);
            const t = truth[i].world;
            const ref = angleAt(t[23], t[25], t[27]);
            fullErr += Math.abs(angleAt(a[23], a[25], a[27]) - ref);
            smoothErr += Math.abs(angleAt(b[23], b[25], b[27]) - ref);
            n++;
        });
    }
    assert.ok(fullErr < smoothErr * 0.95, `3D 膝角平均誤差：只平滑 ${(smoothErr / n).toFixed(2)}°、加上骨頭長度限制 ${(fullErr / n).toFixed(2)}°`);
});
