// 驗證工具（js/analysis/validate.js）：記下角度、和量角器比較的統計、CSV；準確度比賽（11/22）：記下哪個模型算的、分模型統計、同一張照片誰準
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, addSnapshot, loadSnapshots, saveSnapshots, clearSnapshots, stats, toCSV, statsByModel, duels } from '../js/analysis/validate.js';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const pose = knee => ({ angles: { LEFT_KNEE: knee, RIGHT_KNEE: null, LEFT_HIP: 120.44, RIGHT_HIP: 121, LEFT_ELBOW: 170, RIGHT_ELBOW: 171 }, view: { view: 'side' } });

test('記下角度：到小數一位、存起來、最多 200 筆', () => {
    clearSnapshots();
    const s = makeSnapshot(pose(92.36), 'squat', 'LEFT_KNEE');
    assert.equal(s.angles.LEFT_KNEE, 92.4);
    assert.equal(s.angles.RIGHT_KNEE, null);
    assert.equal(s.view, 'side');
    assert.equal(addSnapshot(s), 1);
    for (let i = 0; i < 210; i++) addSnapshot(s);
    assert.equal(loadSnapshots().length, 200);
});

test('統計：偏差、平均誤差、最大、標準差、±5°／±10° 以內；沒填的不算', () => {
    const list = [92, 100, 85, 170, 120].map(k => makeSnapshot(pose(k), 'squat', 'LEFT_KNEE'));
    [90, 104, 85, 160, null].forEach((m, i) => { list[i].measured = m; });
    const r = stats(list);
    assert.deepEqual(r, { n: 4, bias: 2, mae: 4, max: 10, sd: 5.9, within5: 75, within10: 100 });
    assert.deepEqual(stats([]), { n: 0 });
});

test('CSV：有 BOM、表頭、差距', () => {
    const s = makeSnapshot(pose(92), 'squat', 'LEFT_KNEE');
    s.measured = 90;
    saveSnapshots([s]);
    const csv = toCSV(loadSnapshots());
    assert.ok(csv.startsWith('﻿時間,動作,拍攝方向,比對的關節,網站角度,量角器角度,差距,左膝'));
    assert.match(csv.split('\r\n')[1], /,squat,side,左膝,92,90,2,92,,/);
});

// ---------- 準確度比賽（11/22） ----------
const photo = (model, a, other, b, measured) => ({
    time: 1, workout: '', view: 'side', joint: 'LEFT_KNEE', source: 'photo', measured,
    angles: { LEFT_KNEE: a }, model, ...(other ? { other: { model: other, angles: { LEFT_KNEE: b } } } : {})
});

test('記下哪個模型算的：認得的模型才存；另一個模型（照片量角器）也存；被改過的名字、和自己一樣的另一個模型不要', () => {
    assert.equal(makeSnapshot(pose(92), 'squat', 'LEFT_KNEE', 'yolo-n').model, 'yolo-n');
    assert.equal('model' in makeSnapshot(pose(92), 'squat', 'LEFT_KNEE', 'constructor'), false);
    assert.equal('model' in makeSnapshot(pose(92), 'squat', 'LEFT_KNEE'), false, '以前的呼叫方式：不寫模型');
    saveSnapshots([
        photo('lite', 90, 'yolo-n', 95, 88),
        photo('constructor', 90, '__proto__', 95, 88),
        photo('lite', 90, 'lite', 95, 88),
        { ...photo('yolo-s', 90, 'full', 95, 88), other: { model: 'full', angles: { LEFT_KNEE: 'x', RIGHT_KNEE: 1e999 } } }
    ]);
    const list = loadSnapshots();
    assert.equal(list.length, 4);
    assert.equal(list[0].model, 'lite');
    assert.deepEqual([list[0].other.model, list[0].other.angles.LEFT_KNEE], ['yolo-n', 95]);
    assert.equal('model' in list[1] || 'other' in list[1], false, '不認得的模型名字：不寫（不能拿去查物件）');
    assert.equal('other' in list[2], false, '另一個模型和自己一樣：不算');
    assert.deepEqual([list[3].other.model, list[3].other.angles.LEFT_KNEE, list[3].other.angles.RIGHT_KNEE], ['full', null, null], '角度被改壞：當作沒有');
});

test('分模型統計：每一筆的模型加上另一個模型；照能力表順序、沒寫模型的放最後；沒量的不算', () => {
    const list = [
        photo('lite', 92, 'yolo-n', 100, 90),     // lite +2、YOLO26n +10
        photo('lite', 85, 'yolo-n', 84, 85),      // lite 0、YOLO26n −1
        photo('yolo-n', 120, null, null, 116),    // YOLO26n +4
        { ...photo(undefined, 70, null, null, 73) },   // 沒寫模型（11/22 以前記的）：−3
        photo('lite', 92, 'yolo-n', 100, null)    // 沒量：不算
    ];
    const by = statsByModel(list);
    assert.deepEqual(by.map(m => [m.model, m.n, m.mae, m.bias]), [['lite', 2, 1, 1], ['yolo-n', 3, 5, 4.3], ['', 1, 3, -3]]);
    assert.deepEqual(statsByModel([]), []);
});

test('同一張照片誰比較準：兩個模型都算了、也量了的才比；差距取到小數第 1 位，一樣算平手；兩個模型照能力表的順序', () => {
    const list = [
        photo('yolo-n', 100, 'lite', 92, 90),      // lite 差 2、YOLO26n 差 10：lite 贏
        photo('lite', 85, 'yolo-n', 84, 85),       // lite 0、YOLO26n 1：lite 贏
        photo('lite', 80, 'yolo-n', 80.04, 80),    // 都是 0（取到小數第 1 位）：平手
        photo('lite', 70, 'yolo-n', 75, 76),       // lite 6、YOLO26n 1：YOLO26n 贏
        photo('lite', 70, 'yolo-n', null, 76),     // YOLO26n 找不到人：不比
        photo('full', 90, 'yolo-s', 91, 90)        // 另一組
    ];
    const d = duels(list);
    assert.deepEqual(d.map(x => [x.a, x.b, x.n, x.wins.a, x.wins.b, x.wins.tie, x.maeA, x.maeB]),
        [['lite', 'yolo-n', 4, 2, 1, 1, 2, 3], ['full', 'yolo-s', 1, 1, 0, 0, 0, 1]]);
    assert.deepEqual(duels([photo('lite', 90, null, null, 90)]), []);
});

test('CSV（11/22）：最後多四欄（模型、另一個模型、另一個模型的角度和差距），前面的欄位不變', () => {
    saveSnapshots([photo('lite', 92, 'yolo-n', 100.4, 90), makeSnapshot(pose(92), 'squat', 'LEFT_KNEE')]);
    const lines = toCSV(loadSnapshots()).split('\r\n');
    assert.ok(lines[0].endsWith(',來源,模型,另一個模型,另一個模型的角度,另一個模型的差距'));
    assert.ok(lines[1].endsWith(',照片,MediaPipe lite,YOLO26n,100.4,10.4'), lines[1]);
    assert.ok(lines[2].endsWith(',鏡頭,,,,'), lines[2]);
});
