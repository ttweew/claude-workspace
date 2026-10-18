// 運動模式（js/analysis/workouts.js、reps.js）：四個動作的次數、計時
// 用示範動畫（js/ui/demo.js）的側面火柴人做成假的骨架，經過和網站相同的處理流程（平滑、擋鬼點、角度、拍攝方向）
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../js/skeleton/landmarks.js';
import { demoLandmarks } from './helpers.mjs';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { WORKOUTS, formatSeconds } from '../js/analysis/workouts.js';

const W = 640, H = 480;

// 做幾下：每一下 depths[i]（0～1 的深度比例），30 格／秒，一下約 2.4 秒；前後站著 1 秒
function run(id, depths, opts = {}) {
    const pipeline = new PosePipeline();
    const counter = WORKOUTS[id].create();
    let t = 0;
    const prompts = new Set();
    const step = depth => {
        t += 33;
        const pose = pipeline.process(demoLandmarks(id, depth, opts), t, W, H);
        const out = counter.update(pose, t);
        if (out.prompt) prompts.add(out.prompt);
        return out;
    };
    for (let i = 0; i < 30; i++) step(0);
    for (const d of depths) {
        for (let i = 0; i <= 36; i++) step(d * (i / 36));
        for (let i = 0; i < 12; i++) step(d);
        for (let i = 36; i >= 0; i--) step(d * (i / 36));
        for (let i = 0; i < 15; i++) step(0);
    }
    return { counter, prompts, step };
}

test('深蹲（示範動畫）：3 下都算到，蹲到 85° 是蹲到位、淺的是太淺', () => {
    const { counter } = run('squat', [1, 1, 0.45]);
    assert.equal(counter.reps.length, 3);
    assert.deepEqual(counter.reps.map(r => r.depth), ['good', 'good', 'shallow']);
    assert.ok(Math.abs(counter.reps[0].min - 85) < 4, '最低 ' + counter.reps[0].min);
    assert.match(WORKOUTS.squat.toast(counter.reps[0]), /^第 1 下 · 8\d° 蹲到位$/);
});

test('伏地挺身（示範動畫）：手肘 89° 到位；只下去一半是再低一點／太淺；下去不到 120° 不算', () => {
    const { counter } = run('pushup', [1, 0.75, 0.5, 0.3, 1]);
    assert.equal(counter.reps.length, 4, counter.reps.map(r => Math.round(r.min)).join(','));
    assert.deepEqual(counter.reps.map(r => r.depth), ['good', 'close', 'shallow', 'good']);
});

test('伏地挺身：站著彎手肘不算，提示趴下', () => {
    const pipeline = new PosePipeline();
    const counter = WORKOUTS.pushup.create();
    // 把伏地挺身的骨架轉 90°（變成站著）
    let t = 0, prompt = null;
    const upright = depth => demoLandmarks('pushup', depth).map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
    for (let k = 0; k < 3; k++) {
        for (let i = 0; i <= 80; i++) {
            const out = counter.update(pipeline.process(upright(Math.abs(Math.sin(i / 80 * Math.PI))), t += 33, W, H), t);
            if (out.prompt) prompt = out.prompt;
        }
    }
    assert.equal(counter.reps.length, 0);
    assert.match(prompt, /趴下/);
});

test('弓箭步（示範動畫）：兩腳都彎到約 90° 才到位；站起來時後腳還彎著也算站起來', () => {
    const { counter } = run('lunge', [1, 1, 0.5]);
    assert.equal(counter.reps.length, 3, counter.reps.map(r => Math.round(r.min)).join(','));
    assert.deepEqual(counter.reps.map(r => r.depth), ['good', 'good', 'shallow']);
});

test('正面拍：深蹲、伏地挺身、弓箭步都不算，提示側身', () => {
    for (const id of ['squat', 'pushup', 'lunge']) {
        const { counter, prompts } = run(id, [1, 1], { yaw: 1 });
        assert.equal(counter.reps.length, 0, id);
        assert.ok([...prompts].some(p => p.includes('側身')), id + ' ' + [...prompts]);
    }
});

test('棒式：一直線時計時；屁股翹起來暫停；起身 3 秒結束這一次', () => {
    const pipeline = new PosePipeline();
    const timer = WORKOUTS.plank.create();
    let t = 0, out;
    const frame = lm => (out = timer.update(pipeline.process(lm, t += 33, W, H), t));
    const flat = demoLandmarks('plank', 0);
    for (let i = 0; i < 30 * 10; i++) frame(flat);                 // 撐 10 秒
    assert.ok(out.holding && Math.abs(out.seconds - 10) < 0.6, '撐 ' + out.seconds);
    // 屁股翹起來：髖部往上 0.08（髖部角度變小）
    const piked = flat.map((p, i) => (i === P.LEFT_HIP || i === P.RIGHT_HIP ? { ...p, y: p.y - 0.08 } : p));
    for (let i = 0; i < 30 * 3; i++) frame(piked);                 // 3 秒姿勢不對：不算
    assert.equal(out.holding, false);
    const paused = out.seconds;
    assert.ok(paused < 11.2, '姿勢不對不算秒數 ' + paused);
    for (let i = 0; i < 30 * 5; i++) frame(flat);                  // 再撐 5 秒：接著算
    assert.ok(Math.abs(out.seconds - paused - 5) < 0.6, '接著算 ' + out.seconds);
    // 起身（轉 90° 變成站著）4 秒：這一次結束
    const up = flat.map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
    let hold = null;
    for (let i = 0; i < 30 * 4; i++) { frame(up); if (out.hold) hold = out.hold; }
    assert.ok(hold && Math.abs(hold.seconds - out.seconds) < 0.01 || hold, '結束一次');
    assert.equal(timer.holds.length, 1);
    assert.ok(Math.abs(timer.holds[0].seconds - 15) < 1.2, '總共 ' + timer.holds[0].seconds);
    assert.equal(formatSeconds(timer.holds[0].seconds), '0:' + String(Math.floor(timer.holds[0].seconds)).padStart(2, '0'));
    assert.match(out.prompt || '', /趴下/);
});

test('自由模式不計算；秒數格式', () => {
    assert.equal(WORKOUTS.free.create, undefined);
    assert.equal(formatSeconds(0), '0:00');
    assert.equal(formatSeconds(83.7), '1:23');
});
