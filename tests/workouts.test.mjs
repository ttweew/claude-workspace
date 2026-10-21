// 運動模式（js/analysis/workouts.js、reps.js）：四個動作的次數、計時
// 用示範動畫（js/ui/demo.js）的側面火柴人做成假的骨架，經過和網站相同的處理流程（平滑、擋鬼點、角度、拍攝方向）
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../js/skeleton/landmarks.js';
import { demoLandmarks } from './helpers.mjs';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { WORKOUTS, formatSeconds } from '../js/analysis/workouts.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';

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

// 直接給角度、拍攝方向、身體傾斜的假骨架（只測計次的規則，不經過骨架處理）
// lying：肩、髖接近水平（身體和地面約 10°）；不然肩在髖正上方（站著，90°）
function fakePose(angles, view, lying = false) {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    for (const side of ['LEFT', 'RIGHT']) {
        landmarks[P[side + '_SHOULDER']] = lying ? { x: 0.3, y: 0.5, z: 0, visibility: 0.9 } : { x: 0.5, y: 0.3, z: 0, visibility: 0.9 };
        landmarks[P[side + '_HIP']] = lying ? { x: 0.6, y: 0.55, z: 0, visibility: 0.9 } : { x: 0.5, y: 0.6, z: 0, visibility: 0.9 };
    }
    const a = {};
    for (const [k, v] of Object.entries(angles)) { a['LEFT_' + k] = v; a['RIGHT_' + k] = v; }
    return { angles: a, landmarks, view: { view }, width: W, height: H };
}

test('深蹲、弓箭步：太淺又不到 0.8 秒的不算（換姿勢：倒數完轉身、兩下之間很快的小蹲；10/20 實測）；蹲得深的快速深蹲照樣算', () => {
    for (const id of ['squat', 'lunge']) {
        const counter = WORKOUTS[id].create();
        let t = 0;
        const run = (knee, ms) => { for (let e = 0; e < ms; e += 33) counter.update(fakePose({ KNEE: knee, HIP: knee }, 'side'), t += 33); };
        run(175, 600);
        run(120, 300); run(175, 600);     // 0.3 秒的小蹲：不算（不到 0.5 秒，本來就不算）
        assert.equal(counter.reps.length, 0, id + ' 0.3 秒');
        run(120, 600); run(175, 600);     // 約 0.6 秒、太淺（實測多算的那幾下 0.55～0.62 秒、膝蓋 129～139°）：不算
        assert.equal(counter.reps.length, 0, id + ' 太淺 0.6 秒');
        run(120, 1000); run(175, 600);    // 1 秒、太淺（實測最快的真的一下 1.02 秒）：算，標太淺
        assert.equal(counter.reps.length, 1, id + ' 太淺 1 秒');
        assert.equal(counter.reps[0].depth, 'shallow');
        run(80, 600); run(175, 600);      // 0.6 秒、蹲得深（快速深蹲）：算
        assert.equal(counter.reps.length, 2, id + ' 深 0.6 秒');
        // 很快的小蹲、站起來時被判斷成正面：一樣不算（正面拍時也用同一個規則）
        run(120, 550);
        for (let e = 0; e < 1200; e += 33) counter.update(fakePose({ KNEE: 175, HIP: 175 }, 'front'), t += 33);
        run(175, 600);
        assert.equal(counter.reps.length, 2, id + ' 正面站起來的小蹲');
    }
    // 伏地挺身不受影響：實測故意屁股太高時一下只要 0.67 秒
    const push = WORKOUTS.pushup.create();
    let t = 0;
    const run = (elbow, ms) => { for (let e = 0; e < ms; e += 33) push.update(fakePose({ ELBOW: elbow }, 'side', true), t += 33); };
    run(170, 600); run(100, 600); run(170, 400);
    assert.equal(push.reps.length, 1, '伏地挺身 0.6 秒的一下照樣算');
});

test('伏地挺身：做完起身（已經不是趴著）轉成正面、手撐一下地，不算一下；之後趴回去做的照樣算（10/20 實測）', () => {
    const counter = WORKOUTS.pushup.create();
    let t = 0;
    const run = (elbow, view, lying, ms) => { for (let e = 0; e < ms; e += 33) counter.update(fakePose({ ELBOW: elbow }, view, lying), t += 33); };
    run(170, 'side', true, 600);
    run(85, 'side', true, 800);
    run(170, 'side', true, 600);
    assert.equal(counter.reps.length, 1);
    run(110, 'side', true, 300);       // 起身前手肘彎一下（還算趴著）
    run(160, 'front', false, 1000);    // 站起來、面對鏡頭：以前這裡算成一下
    assert.equal(counter.reps.length, 1, '起身不算');
    run(170, 'side', true, 1000);      // 趴回去
    run(85, 'side', true, 800);
    run(170, 'side', true, 600);
    assert.equal(counter.reps.length, 2, '趴回去做的照樣算');
    assert.ok(Math.abs(counter.reps[1].min - 85) < 1 && counter.reps[1].end - counter.reps[1].start < 2, '第二下是新的一下（不是起身前那一下接著算）');
});

test('棒式的錯誤：做完起身時屁股翹起來不記；中途屁股翹高又放下來、塌腰都記（10/20 實測：做對的那組被記成屁股太高）', () => {
    const flat = demoLandmarks('plank', 0);
    const shift = dy => flat.map((p, i) => (i === P.LEFT_HIP || i === P.RIGHT_HIP ? { ...p, y: p.y + dy } : p));
    const piked = shift(-0.08), sagged = shift(0.06);
    const up = flat.map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
    const session = steps => {
        const pipeline = new PosePipeline(), tracker = new WorkoutTracker('plank');
        let t = 0;
        for (const [lm, sec] of steps) for (let i = 0; i < sec * 30; i++) tracker.update(pipeline.process(lm, t += 33, W, H), t);
        return tracker.items;
    };
    // 撐 10 秒 → 屁股翹起來 2 秒 → 起身：這一次沒有錯誤（以前記成屁股太高）
    let holds = session([[flat, 10], [piked, 2], [up, 4]]);
    assert.equal(holds.length, 1);
    assert.deepEqual(holds[0].errors, [], '起身前屁股翹起來不記');
    // 撐 5 秒 → 屁股翹高 3 秒 → 放下來再撐 5 秒 → 起身：記屁股太高，也有最嚴重的數字
    holds = session([[flat, 5], [piked, 3], [flat, 5], [up, 4]]);
    assert.deepEqual(holds[0].errors, ['pike']);
    assert.ok(holds[0].peaks.pike > 0, JSON.stringify(holds[0].peaks));
    // 塌腰 3 秒（髖部角度還夠大時照樣計時）→ 記塌腰
    holds = session([[flat, 3], [sagged, 3], [flat, 3], [up, 4]]);
    assert.deepEqual(holds[0].errors, ['sag']);
    // 趴下準備時屁股先翹著（還沒開始計時）→ 放下來撐：不記（還沒開始這一次）
    holds = session([[piked, 3], [flat, 8], [up, 4]]);
    assert.deepEqual(holds[0].errors, [], '開始前的紅字還沒消失也不記');
});
