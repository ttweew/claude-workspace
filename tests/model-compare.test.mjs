// 兩個模型對照（js/analysis/model-compare.js，11/21）：角度差、次數、每一下最低角度的配對、錯誤統計
import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff, resultSummary, compareResults, jointsFor, MAIN_JOINTS } from '../js/analysis/model-compare.js';
import { ANGLE_KEYS, analyzeRecording } from '../js/data/replay-core.js';
import { demoLandmarks } from './helpers.mjs';

const A = ANGLE_KEYS.length;
// 假的重播結果：n 格，每格的角度用 fn(i, key) 給（NaN 是算不出來），present 預設都有人
function fake(n, fn, { present = () => 1, reps = [] } = {}) {
    const r = { n, present: new Uint8Array(n), angles: new Float32Array(n * A).fill(NaN), reps };
    for (let i = 0; i < n; i++) {
        r.present[i] = present(i);
        ANGLE_KEYS.forEach((k, j) => { r.angles[i * A + j] = fn(i, k); });
    }
    return r;
}

test('每個動作看的關節：左右各一；不認得的動作看自由模式的', () => {
    assert.deepEqual(jointsFor('squat'), ['LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_HIP', 'RIGHT_HIP']);
    assert.deepEqual(jointsFor('pushup'), ['LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_HIP', 'RIGHT_HIP']);
    for (const bad of ['constructor', '__proto__', '', undefined]) assert.deepEqual(jointsFor(bad), jointsFor('free'), String(bad));
    for (const keys of Object.values(MAIN_JOINTS)) for (const p of keys) assert.ok(ANGLE_KEYS.includes('LEFT_' + p), p);
});

test('角度差：只比兩邊都有人、都算得出來的格子；平均差有正負、絕對差、9 成、最大', () => {
    const a = fake(10, (i, k) => (k === 'LEFT_KNEE' ? 100 + i : NaN));
    // B 比 A 小 5°；第 3 格 B 沒有人、第 4 格 B 的角度算不出來
    const b = fake(10, (i, k) => (k === 'LEFT_KNEE' ? (i === 4 ? NaN : 95 + i) : NaN), { present: i => (i === 3 ? 0 : 1) });
    const d = angleDiff(a, b, 'LEFT_KNEE');
    assert.equal(d.frames, 8);
    assert.equal(d.mean, 5);
    assert.equal(d.meanAbs, 5);
    assert.equal(d.p90, 5);
    assert.equal(d.max, 5);
    // 一正一負：平均差 0、絕對差 10
    const c = fake(2, (i, k) => (k === 'LEFT_KNEE' ? (i ? 90 : 110) : NaN));
    const e = fake(2, (i, k) => (k === 'LEFT_KNEE' ? 100 : NaN));
    assert.deepEqual(angleDiff(c, e, 'LEFT_KNEE'), { key: 'LEFT_KNEE', frames: 2, mean: 0, meanAbs: 10, p90: 10, max: 10 });
    // 沒得比：0 格、其他是 null；不認得的角度、沒有結果也一樣
    assert.deepEqual(angleDiff(a, b, 'RIGHT_KNEE'), { key: 'RIGHT_KNEE', frames: 0, mean: null, meanAbs: null, p90: null, max: null });
    assert.equal(angleDiff(a, b, 'constructor').frames, 0);
    assert.equal(angleDiff(null, b, 'LEFT_KNEE').frames, 0);
});

test('一個模型的整理：找到人的比例、幾下、每一下最低角度、每種錯誤幾下（被改過的錯誤代號不算）', () => {
    const r = fake(4, () => 90, {
        present: i => (i < 3 ? 1 : 0),
        reps: [{ min: 85.4, errors: ['lean'] }, { min: 92.6, errors: ['lean', 'heel'] }, { min: NaN, errors: [3, null] }, { min: 70 }]
    });
    const s = resultSummary(r);
    assert.equal(s.frames, 4);
    assert.equal(s.seen, 75);
    assert.equal(s.reps, 4);
    assert.deepEqual(s.mins, [85, 93, null, 70]);
    assert.deepEqual(s.errors, { lean: 2, heel: 1 });
    // 'constructor' 這種名字當錯誤代號：照樣只是一個名字（不會查到內建的東西）
    assert.deepEqual(resultSummary(fake(1, () => 0, { reps: [{ min: 1, errors: ['constructor', 'constructor'] }] })).errors, { constructor: 2 });
    assert.deepEqual(resultSummary(null), { frames: 0, seen: 0, reps: 0, mins: [], seconds: [], errors: {} });
});

test('兩個模型並排：次數不一樣時每一下照順序配到少的那邊', () => {
    const a = fake(3, () => 90, { reps: [{ min: 80 }, { min: 90 }, { min: 100 }] });
    const b = fake(3, () => 85, { reps: [{ min: 70 }, { min: 95 }] });
    const c = compareResults(a, b, 'squat');
    assert.equal(c.sameReps, false);
    assert.deepEqual(c.repDiffs, [10, -5]);
    assert.equal(c.joints.length, 4);
    assert.equal(c.joints[0].key, 'LEFT_KNEE');
    assert.equal(c.joints[0].mean, 5);
});

test('真的重播算法：同一串骨架給兩個模型，結果一模一樣（差 0、次數一樣）', async () => {
    const frames = [];
    for (let k = 0; k < 3; k++) {
        for (let i = 0; i <= 60; i++) frames.push(demoLandmarks('squat', i <= 30 ? i / 30 : (60 - i) / 30));
        for (let i = 0; i < 30; i++) frames.push(demoLandmarks('squat', 0));
    }
    const parsed = { meta: { workout: 'squat' }, frames: frames.map((lm, i) => ({ t: i * 1000 / 30, raw: lm, world: null })) };
    const ra = await analyzeRecording(parsed, 640, 480, { workout: 'squat' });
    const rb = await analyzeRecording(parsed, 640, 480, { workout: 'squat' });
    const c = compareResults(ra, rb, 'squat');
    assert.equal(c.a.reps, 3);
    assert.equal(c.sameReps, true);
    assert.deepEqual(c.repDiffs, [0, 0, 0]);
    for (const j of c.joints) if (j.frames) assert.equal(j.meanAbs, 0, j.key);
});
