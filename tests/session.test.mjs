// 運動總結（js/analysis/session.js）：次數、深度、錯誤統計、和上一次比較、紀錄
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, compare, describe, saveSession, loadHistory, clearHistory, validSession, shortLine, autoList, AUTO_LIST_MAX } from '../js/analysis/session.js';
import { formatSeconds } from '../js/analysis/workouts.js';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const rep = (min, depth, errors = [], start = 0, end = 2.4) => ({ min, depth, errors, start, end });

test('深蹲：次數、深度、最低和平均角度、每下秒數、錯誤統計', () => {
    const s = summarize('squat', [rep(85, 'good'), rep(100, 'close', ['lean']), rep(88, 'good', ['lean', 'heel']), rep(120, 'shallow')], 0, 120000);
    assert.equal(s.count, 4);
    assert.deepEqual([s.good, s.close, s.shallow, s.clean], [2, 1, 1, 2]);
    assert.equal(s.best, 85);
    assert.equal(s.average, 98);
    assert.equal(s.tempo, 2.4);
    assert.deepEqual(s.errors, { lean: 2, heel: 1 });
    assert.equal(s.minutes, 2);
    const lines = describe(s);
    assert.equal(lines[0], '深蹲 4 下：到位 2、再低一點 1、太淺 1');
    assert.equal(lines[2], '要注意：上身前傾 2 下、腳跟離地 1 下');
});

test('棒式：次數、最久、總共（秒數無條件捨去，和鏡頭畫面、每一次的提示一樣）', () => {
    const s = summarize('plank', [{ seconds: 32.4, errors: ['sag'] }, { seconds: 45.6, errors: [] }], 0, 60000);
    // 45.6 秒：鏡頭畫面和提示都寫「0:45」（formatSeconds 捨去），總結也要是 0:45，不能變成 0:46
    assert.deepEqual([s.count, s.best, s.total], [2, 45, 77]);
    assert.equal(describe(s)[0], '棒式 2 次，最久 0:45，總共 1:17');
    assert.equal(formatSeconds(45.6), '0:45');
});

test('沒有做任何一下、自由模式：不記', () => {
    assert.equal(summarize('squat', [], 0, 1000), null);
    assert.equal(summarize('free', [rep(80, 'good')], 0, 1000), null);
});

test('和上一次比較；紀錄只比同一個動作、最多 50 次', () => {
    clearHistory();
    const a = summarize('squat', [rep(85, 'good'), rep(100, 'close')], 0, 1);
    assert.equal(saveSession(a), null, '第一次沒有上一次');
    saveSession(summarize('pushup', [rep(90, 'good')], 0, 1));
    const b = summarize('squat', [rep(85, 'good'), rep(88, 'good', ['lean']), rep(90, 'good')], 0, 1);
    const prev = saveSession(b);
    assert.equal(prev.count, 2, '上一次深蹲（不是伏地挺身）');
    assert.deepEqual(compare(b, prev), ['比上次多 1 下', '到位比例 100%，比上次進步 50%', '沒有錯誤的比例 67%（上次 100%）']);
    for (let i = 0; i < 60; i++) saveSession(a);
    assert.equal(loadHistory().length, 50);
    const p1 = summarize('plank', [{ seconds: 30, errors: [] }], 0, 1), p2 = summarize('plank', [{ seconds: 42, errors: [] }], 0, 1);
    assert.deepEqual(compare(p2, p1), ['最久撐了 0:42，比上次多 12 秒']);
});

test('AI 全自動做了哪幾段（autoList）：6 段以內照順序接起來；超過 6 段每種加起來（11/8 保養：30 分鐘換 51 次動作時那一句 574 個字）', () => {
    const sq = { workout: 'squat', count: 12, best: 85 }, pu = { workout: 'pushup', count: 8, best: 80 }, lu = { workout: 'lunge', count: 8, best: 95 };
    const pl = { workout: 'plank', count: 2, best: 26.4 };
    assert.equal(shortLine(sq), '深蹲 12 下');
    assert.equal(shortLine(pl), '棒式 2 次（最久 0:26）');
    assert.equal(autoList([sq, pu]), '深蹲 12 下 → 伏地挺身 8 下');
    // 重播分析：每一段後面加 AI 評分平均
    assert.equal(autoList([sq, pl], i => '（第 ' + (i + 1) + ' 段）'), '深蹲 12 下（第 1 段） → 棒式 2 次（最久 0:26）（第 2 段）');
    const six = [sq, pu, lu, sq, pu, lu];
    assert.equal(six.length, AUTO_LIST_MAX);
    assert.equal(autoList(six).split(' → ').length, 6);
    // 超過 6 段：照第一次出現的順序，每種幾段、共幾下（棒式共幾次、最久的那一次）；不加 note
    const loops = Array.from({ length: 17 }, () => [sq, pu, lu]).flat();
    const long = autoList(loops, () => '（不加）');
    assert.equal(long, '深蹲 17 段共 204 下、伏地挺身 17 段共 136 下、弓箭步 17 段共 136 下');
    assert.ok(long.length < 60, long.length);
    assert.equal(autoList([...six, pl, { workout: 'plank', count: 1, best: 40.9 }]), '深蹲 2 段共 24 下、伏地挺身 2 段共 16 下、弓箭步 2 段共 16 下、棒式 2 段共 3 次（最久 0:40）');
});
