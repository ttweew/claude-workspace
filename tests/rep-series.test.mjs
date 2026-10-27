// 「每一下」圖表的數字（js/analysis/rep-series.js，10/27）：和總結（summarize）用同一套算法，數字要一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { repSeries, DEPTH_LINES } from '../js/analysis/rep-series.js';
import { summarize } from '../js/analysis/session.js';
import { SQUAT } from '../js/analysis/squat.js';
import { PUSHUP_CONFIG, LUNGE_CONFIG } from '../js/analysis/workouts.js';

const rep = (min, depth, start, end, errors = []) => ({ min, depth, start, end, errors, similarity: 90 });

test('深蹲：每一下的角度、深度、秒數、錯誤；平均秒數和總結的「每下約幾秒」一樣', () => {
    const items = [rep(85.4, 'good', 0, 2.26, ['lean']), rep(95.6, 'close', 3, 5.04), rep(120.2, 'shallow', 6, 7.91, ['lean', 'heel']), rep(88, 'good', 9, 11.33)];
    const s = repSeries('squat', items);
    assert.equal(s.kind, 'reps');
    assert.equal(s.joint, '膝蓋');
    assert.deepEqual([s.good, s.close], [SQUAT.GOOD, SQUAT.CLOSE]);
    assert.deepEqual(s.reps.map(r => [r.n, r.angle, r.depth, r.seconds]), [[1, 85, 'good', 2.3], [2, 96, 'close', 2], [3, 120, 'shallow', 1.9], [4, 88, 'good', 2.3]]);
    assert.deepEqual(s.reps[2].errors, ['上身前傾', '腳跟離地']);
    const sum = summarize('squat', items, 0, 60000);
    assert.equal(s.tempo, sum.tempo, '平均秒數和總結一樣');
    assert.equal(Math.min(...s.reps.map(r => r.angle)), sum.best, '最深的角度和總結一樣');
    assert.equal(s.reps.filter(r => r.depth === 'good').length, sum.good, '到位幾下和總結一樣');
});

test('伏地挺身、弓箭步的門檻和計次時判斷深度的一樣', () => {
    assert.deepEqual([DEPTH_LINES.pushup.good, DEPTH_LINES.pushup.close, DEPTH_LINES.pushup.joint], [PUSHUP_CONFIG.good, PUSHUP_CONFIG.close, '手肘']);
    assert.deepEqual([DEPTH_LINES.lunge.good, DEPTH_LINES.lunge.close], [LUNGE_CONFIG.good, LUNGE_CONFIG.close]);
    // 深度欄位壞掉時照門檻重新判斷
    const s = repSeries('pushup', [rep(94, 'xx', 0, 1), rep(104, undefined, 2, 3), rep(111, 'constructor', 4, 5)]);
    assert.deepEqual(s.reps.map(r => r.depth), ['good', 'close', 'shallow']);
});

test('被改過的資料：壞掉的那一下不畫、後面的編號不變；不認得的錯誤不寫；秒數壞掉的留空、不算進平均', () => {
    const items = [rep(85, 'good', 0, 2), null, rep('90', 'good', 0, 1), rep(NaN, 'good', 0, 1), rep(200, 'good', 0, 1),
        rep(100, 'close', 5, 'x', ['constructor', 'toString', 42, 'lean']), rep(92, 'close', 8, 7), rep(80, 'good', 10, 13)];
    const s = repSeries('squat', items);
    assert.deepEqual(s.reps.map(r => [r.n, r.angle, r.seconds]), [[1, 85, 2], [6, 100, null], [7, 92, null], [8, 80, 3]]);
    assert.deepEqual(s.reps[1].errors, ['上身前傾']);
    assert.equal(s.tempo, 2.5);
    // 全部都沒有秒數
    assert.equal(repSeries('squat', [rep(85, 'good', null, null)]).tempo, null);
});

test('棒式：每一次的秒數無條件捨去（和總結、畫面一樣）', () => {
    const items = [{ seconds: 59.9, errors: [] }, { seconds: 20.4, errors: ['sag'] }, { seconds: -1 }, { seconds: 'x' }];
    const s = repSeries('plank', items);
    assert.equal(s.kind, 'hold');
    assert.deepEqual(s.holds.map(h => [h.n, h.seconds, h.errors]), [[1, 59, []], [2, 20, ['塌腰']]]);
    assert.deepEqual(summarize('plank', items.slice(0, 2), 0, 1).seconds, s.holds.map(h => h.seconds));
});

test('沒有可以畫的：自由模式、不認得的動作、空的、全部壞掉', () => {
    for (const id of ['free', 'constructor', 'toString', '', undefined]) assert.equal(repSeries(id, [rep(85, 'good', 0, 1)]), null, String(id));
    assert.equal(repSeries('squat', []), null);
    assert.equal(repSeries('squat', null), null);
    assert.equal(repSeries('squat', [null, rep(NaN, 'good', 0, 1)]), null);
    assert.equal(repSeries('plank', [{ seconds: NaN }]), null);
});
