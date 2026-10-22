// 照片量角器（10/22，js/analysis/protractor.js）：三個點的角度、AI 的點、存進驗證實驗 A 的紀錄
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOINTS, isJoint, pointAngle, aiPoints, startPoints, defaultJoint, photoSnapshot } from '../js/analysis/protractor.js';
import { addSnapshot, loadSnapshots, saveSnapshots, clearSnapshots, stats, toCSV } from '../js/analysis/validate.js';
import { computeAngles } from '../js/analysis/angles.js';
import { P } from '../js/skeleton/landmarks.js';
import { demoLandmarks } from './helpers.mjs';

const W = 640, H = 480;

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

test('三個點的角度：直角 90°、一直線 180°、兩點重疊量不出來；照片放大縮小角度不變', () => {
    assert.equal(pointAngle({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }), 90);
    assert.equal(pointAngle(...startPoints(640, 480)), 180);
    assert.equal(pointAngle({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 10 }), null);
    const a = pointAngle({ x: 100, y: 50 }, { x: 120, y: 200 }, { x: 60, y: 330 });
    assert.ok(Math.abs(pointAngle({ x: 25, y: 12.5 }, { x: 30, y: 50 }, { x: 15, y: 82.5 }) - a) < 1e-9);
});

test('AI 的點：和網站算的角度一樣（同一張照片）；看不清楚的點不用；關節名稱先比對清單', () => {
    const lm = demoLandmarks('squat', 0.6);
    const angles = computeAngles(lm, W, H);
    for (const key of ['LEFT_KNEE', 'RIGHT_HIP', 'LEFT_ELBOW']) {
        const pts = aiPoints(lm, key, W, H);
        assert.ok(Math.abs(pointAngle(...pts) - angles[key]) < 0.01, key);
    }
    const hidden = lm.map((p, i) => (i === P.LEFT_ANKLE ? { ...p, visibility: 0.1 } : p));
    assert.equal(aiPoints(hidden, 'LEFT_KNEE', W, H), null);
    assert.equal(aiPoints(lm, 'constructor', W, H), null);
    assert.equal(isJoint('constructor'), false);
    assert.equal(JOINTS.length, 6);
    assert.match(defaultJoint(lm), /^(LEFT|RIGHT)_KNEE$/);
    assert.equal(defaultJoint(null), 'LEFT_KNEE');
});

test('記下來：和鏡頭畫面「記下角度」同一個清單，寫明來源是照片；量的角度直接填進量角器那一欄、一起算統計；CSV 最後一欄是來源', () => {
    clearSnapshots();
    const angles = { LEFT_KNEE: 95.06, RIGHT_KNEE: null, LEFT_HIP: 120.44, RIGHT_HIP: 121, LEFT_ELBOW: 170, RIGHT_ELBOW: 171 };
    addSnapshot(photoSnapshot(angles, 'side', 'LEFT_KNEE', 92.44, 1000));
    addSnapshot(photoSnapshot(null, null, 'LEFT_KNEE', 88, 2000));   // AI 找不到人：網站那欄空著，不算進統計
    addSnapshot({ time: 3000, workout: 'squat', view: 'side', joint: 'LEFT_KNEE', angles, measured: null });   // 鏡頭畫面記下的
    const list = loadSnapshots();
    assert.deepEqual(list.map(s => s.source), ['photo', 'photo', undefined]);
    assert.deepEqual([list[0].angles.LEFT_KNEE, list[0].measured], [95.1, 92.4]);
    assert.equal(list[1].angles.LEFT_KNEE, null);
    assert.deepEqual(stats(list), { n: 1, bias: 2.7, mae: 2.7, max: 2.7, sd: 0, within5: 100, within10: 100 });
    const csv = toCSV(list).trim().split('\r\n');
    assert.ok(csv[0].endsWith(',來源'), csv[0]);
    assert.deepEqual(csv.slice(1).map(l => l.split(',').pop()), ['照片', '照片', '鏡頭']);
    // 存的資料被改過：來源不是 photo 的當成鏡頭畫面記下的
    saveSnapshots([{ ...list[0], source: 'constructor' }]);
    assert.equal(loadSnapshots()[0].source, undefined);
});
