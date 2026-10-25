// 運動紀錄匯出 CSV（js/data/history-csv.js，10/25 提案）
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { HISTORY_HEAD, historyRow, historyCsv, historyFileName } = await import('../js/data/history-csv.js');
const { summarize, saveSession, loadHistory, clearHistory } = await import('../js/analysis/session.js');

const START = new Date(2026, 9, 25, 9, 5).getTime();
const reps = list => list.map(([min, depth, errors = []], i) => ({ min, depth, errors, start: i * 2, end: i * 2 + 2.5, similarity: 90 }));
const col = name => HISTORY_HEAD.indexOf(name);
// 把 CSV 拆回一格一格（只處理這裡用到的：引號包起來、兩個引號代表一個）
function parse(csv) {
    return csv.replace(/^﻿/, '').split('\r\n').filter(Boolean).map(line => {
        const out = [];
        let cur = '', quoted = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (quoted && c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') quoted = !quoted;
            else if (c === ',' && !quoted) { out.push(cur); cur = ''; }
            else cur += c;
        }
        out.push(cur);
        return out;
    });
}

test('深蹲一列：日期、次數、到位分布、角度、每下秒數、相似度、錯誤（多的在前面）、目標、自己數的、計次準確率', () => {
    const s = summarize('squat', reps([[85, 'good', ['lean']], [95, 'close', ['lean', 'heel']], [88, 'good'], [120, 'shallow']]), START, START + 90000);
    s.goal = 5;
    s.actual = 5;
    const row = historyRow(s);
    assert.equal(row.length, HISTORY_HEAD.length);
    assert.deepEqual(row.slice(0, 12), ['2026/10/25', '09:05', '深蹲', 4, 2, 2, 1, 1, 85, 97, 2.5, 90]);
    assert.equal(row[col('最久（秒）')], '');
    assert.equal(row[col('錯誤')], '上身前傾 2；腳跟離地 1');
    assert.equal(row[col('目標')], '5 下');
    assert.equal(row[col('達成目標')], '否');
    assert.equal(row[col('自己數的')], 5);
    assert.equal(row[col('計次準確率')], '80%');
    assert.equal(row[col('分鐘')], 1.5);
});

test('棒式一列：最久、總共的秒數無條件捨去（和畫面、總結一樣）；計次的欄位空著', () => {
    const s = summarize('plank', [{ seconds: 59.9, errors: [] }, { seconds: 20.4, errors: ['sag'] }], START, START + 120000);
    s.goal = 60;
    const row = historyRow(s);
    assert.equal(row[col('動作')], '棒式');
    assert.equal(row[col('最久（秒）')], 59);
    assert.equal(row[col('總共（秒）')], 79);
    assert.equal(row[col('到位')], '');
    assert.equal(row[col('相似度')], '');
    assert.equal(row[col('錯誤')], '塌腰 1');
    assert.equal(row[col('目標')], '60 秒');
    assert.equal(row[col('達成目標')], '否');
    assert.equal(row[col('自己數的')], '', '棒式沒有自己數的次數');
});

test('被改過的紀錄：不認得的錯誤代號、不對的相似度、目標、自己數的都留空，不寫出 NaN、[object Object]', () => {
    const s = summarize('squat', reps([[85, 'good'], [88, 'good']]), START, START + 60000);
    const row = historyRow({ ...s, similarity: { a: 1 }, goal: '10', actual: -3, errors: { constructor: 1, toString: 2, lean: 'x' } });
    assert.equal(row[col('相似度')], '');
    assert.equal(row[col('目標')], '');
    assert.equal(row[col('達成目標')], '');
    assert.equal(row[col('自己數的')], '');
    assert.equal(row[col('錯誤')], '');
    const text = historyCsv([{ ...s, similarity: 'abc', minutes: NaN }]);
    assert.ok(!/NaN|undefined|null|\[object/.test(text), text);
});

test('整份 CSV：Excel 打得開（BOM、\\r\\n）、一列一次運動、舊的在上面；紀錄被改壞的那一筆不會出現；檔名只有英文數字', () => {
    store.clear();
    clearHistory();
    saveSession(summarize('squat', reps([[85, 'good']]), START, START + 30000));
    saveSession(summarize('plank', [{ seconds: 30, errors: [] }], START + 600000, START + 660000));
    const list = JSON.parse(store.get('workoutHistory'));
    list.push({ workout: 'constructor', count: 3 }, null, 'x');
    store.set('workoutHistory', JSON.stringify(list));
    const csv = historyCsv(loadHistory());
    assert.ok(csv.startsWith('﻿日期,時間,動作,次數'));
    assert.ok(csv.endsWith('\r\n') && !/[^\r]\n/.test(csv));
    const rows = parse(csv);
    assert.deepEqual(rows.map(r => r[col('動作')]), ['動作', '深蹲', '棒式']);
    assert.deepEqual(rows.map(r => r.length), [HISTORY_HEAD.length, HISTORY_HEAD.length, HISTORY_HEAD.length]);
    assert.equal(historyCsv([]), '﻿' + HISTORY_HEAD.join(',') + '\r\n');
    assert.equal(historyCsv(null), '﻿' + HISTORY_HEAD.join(',') + '\r\n');
    assert.equal(historyFileName(new Date(2026, 9, 25, 9, 5)), 'workout_history_20261025_0905.csv');
    store.clear();
});
