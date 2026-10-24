// 外部來的資料（網址、錄製檔、這台裝置存的資料）可能被改過或損壞：網站不能壞掉、數字不能出現 NaN
// 特別是 'constructor'、'toString'、'__proto__' 這種 JavaScript 內建的名字：直接拿去查一般物件會查到東西
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { WORKOUTS, isWorkout, setWorkout, getWorkout, setWorkoutLocked, onWorkoutChange } = await import('../js/analysis/workouts.js');
const { WorkoutTracker } = await import('../js/analysis/tracker.js');
const { errorShort } = await import('../js/analysis/form.js');
const { summarize, describe, compare, loadHistory, saveSession, clearHistory, validSession } = await import('../js/analysis/session.js');
const { loadSnapshots, stats, toCSV, validMeasure } = await import('../js/analysis/validate.js');

const TRICKY = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', '', null, undefined, 42, {}];

test('動作代號：內建的名字、空的、不是文字的都不算', () => {
    for (const id of TRICKY) assert.equal(isWorkout(id), false, String(id));
    for (const id of Object.keys(WORKOUTS)) assert.equal(isWorkout(id), true, id);
    const before = getWorkout().id;
    for (const id of TRICKY) setWorkout(id);
    assert.equal(getWorkout().id, before, '不認得的代號不會被選上');
});

test('錄製中鎖住：不能換動作，停止後可以', () => {
    let changed = 0;
    onWorkoutChange(() => changed++);
    setWorkout('squat');
    changed = 0;
    setWorkoutLocked(true);
    setWorkout('pushup');
    assert.equal(getWorkout().id, 'squat');
    assert.equal(changed, 0);
    setWorkoutLocked(false);
    setWorkout('pushup');
    assert.equal(getWorkout().id, 'pushup');
    assert.equal(changed, 1);
});

test('計算器：不認得的動作當作自由模式（不計次、不判斷）', () => {
    for (const id of TRICKY) {
        const t = new WorkoutTracker(id);
        assert.equal(t.workout.id, 'free', String(id));
        assert.equal(t.counter, null);
    }
});

test('錯誤的簡稱：不認得的代號原樣顯示文字，不會變成程式碼', () => {
    assert.equal(errorShort('lean'), '上身前傾');
    for (const id of ['constructor', 'toString', '__proto__']) assert.equal(errorShort(id), id);
});

test('運動紀錄：欄位不對的那一筆不用，其他照常', () => {
    clearHistory();
    const good = summarize('squat', [{ min: 88, depth: 'good', errors: [], start: 0, end: 2 }], 0, 1);
    const hold = summarize('plank', [{ seconds: 20.7, errors: [] }], 0, 1);
    const bad = [
        null, 5, 'x', [], { ...good, workout: 'constructor' }, { ...good, workout: 'free' }, { ...good, count: 'many' },
        { ...good, count: 0 }, { ...good, count: 2 }, { ...good, best: NaN }, { ...good, tempo: null }, { ...good, errors: ['lean'] },
        { ...good, errors: { lean: -1 } }, { ...good, clean: 5 }, { ...hold, best: '20' }, { ...good, date: 'today' }
    ];
    store.set('workoutHistory', JSON.stringify([...bad, good, hold]));
    const list = loadHistory();
    assert.equal(list.length, 2, JSON.stringify(list.map(s => s.workout)));
    for (const s of list) {
        assert.ok(validSession(s));
        for (const line of describe(s)) assert.ok(!/NaN|undefined|function/.test(line), line);
    }
    // 存新的一筆時，壞掉的會被整理掉
    const prev = saveSession(good);
    assert.equal(prev.count, 1);
    assert.equal(JSON.parse(store.get('workoutHistory')).length, 3);
    assert.deepEqual(compare(good, prev), ['次數和上次一樣', '到位比例 100%，和上次一樣']);
    // 整個壞掉（不是 JSON、不是陣列）：當作沒有紀錄
    for (const raw of ['{', '"x"', '{"a":1}', 'null']) {
        store.set('workoutHistory', raw);
        assert.deepEqual(loadHistory(), [], raw);
    }
});

test('運動紀錄的總結：相似度不是 0～100 的數字不寫、不認得的錯誤代號不寫（10/24 安全複查）', () => {
    const good = summarize('squat', [{ min: 88, depth: 'good', errors: ['lean'], start: 0, end: 2, similarity: 90 }], 0, 1);
    for (const sim of ['x', [], {}, -5, 1e9, true, '<b>']) {
        const line = describe({ ...good, similarity: sim })[1];
        assert.ok(!line.includes('相似'), JSON.stringify(sim) + ' → ' + line);
    }
    assert.match(describe({ ...good, similarity: 95.6 })[1], /相似 96%$/);
    const lines = describe({ ...good, errors: { lean: 1, constructor: 1, toString: 1 } });
    assert.ok(lines.includes('要注意：上身前傾 1 下'), lines.join(' | '));
    assert.ok(!lines.some(l => /constructor|toString/.test(l)), lines.join(' | '));
});

test('記下的角度：被改過的筆數整理掉；量角器打錯字（0～180 以外）不算進統計', () => {
    store.set('angleSnapshots', JSON.stringify([
        null, { angles: {} }, { joint: 'constructor', angles: {} }, { joint: 'LEFT_KNEE', angles: 'x' },
        { time: 1, workout: '=HYPERLINK("x")', view: '<b>', joint: 'LEFT_KNEE', angles: { LEFT_KNEE: '92' }, measured: 90 },
        { time: 2, workout: 'squat', view: 'side', joint: 'LEFT_KNEE', angles: { LEFT_KNEE: 92.4 }, measured: 900 },
        { time: 3, workout: 'squat', view: 'side', joint: 'LEFT_KNEE', angles: { LEFT_KNEE: 92.4 }, measured: 90 },
        { time: 4, workout: 'squat', view: 'side', joint: 'LEFT_KNEE', angles: { LEFT_KNEE: 120 }, measured: -5 }
    ]));
    const list = loadSnapshots();
    assert.equal(list.length, 4);
    assert.equal(list[0].workout, '', '不認得的動作清掉');
    assert.equal(list[0].view, null);
    assert.equal(list[0].angles.LEFT_KNEE, null, '角度不是數字的當作沒有');
    assert.deepEqual(list.map(s => s.measured), [90, null, 90, null]);
    assert.deepEqual(stats(list), { n: 1, bias: 2.4, mae: 2.4, max: 2.4, sd: 0, within5: 100, within10: 100 });
    for (const v of [0, 90, 180]) assert.ok(validMeasure(v));
    for (const v of [-1, 181, NaN, Infinity, '90', null]) assert.ok(!validMeasure(v), String(v));
});

test('CSV：文字開頭是 = + - @ 時加 \'，Excel 不會當成公式；負數照常', () => {
    const csv = toCSV([{ time: 0, workout: '=1+1', view: '@x', joint: 'LEFT_KNEE', angles: { LEFT_KNEE: -3 }, measured: 2 }]);
    const row = csv.split('\r\n')[1].split(',');
    assert.equal(row[1], "'=1+1");
    assert.equal(row[2], "'@x");
    assert.equal(row[4], '-3');
    assert.equal(row[6], '-5');
});
