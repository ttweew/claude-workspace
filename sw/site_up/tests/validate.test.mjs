// 驗證工具（js/analysis/validate.js）：記下角度、和量角器比較的統計、CSV
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, addSnapshot, loadSnapshots, saveSnapshots, clearSnapshots, stats, toCSV } from '../js/analysis/validate.js';

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
