// 自訂目標（js/analysis/goal.js，10/25 組員回饋）：每個動作的目標、棒式報時、總結寫有沒有達成
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { GOAL_PRESETS, GOAL_RANGE, goalKind, validGoal, parseGoal, loadGoals, saveGoal, goalText, goalLabel, goalLine, repGoalText, HoldCaller } =
    await import('../js/analysis/goal.js');
const { summarize, describe } = await import('../js/analysis/session.js');
const { cloudSession } = await import('../js/cloud/sync.js');

// 棒式一次撐 seconds 秒，每 0.1 秒給一次秒數（像鏡頭每一格），回傳講了哪些話（第幾秒、講什麼）
function calls(goal, seconds, step = 0.1) {
    const caller = new HoldCaller(goal);
    const out = [];
    for (let t = 0; t <= seconds + 1e-9; t += step) {
        const c = caller.update(t);
        if (c) out.push(Math.floor(t + 1e-9) + ':' + c.text);
    }
    return out;
}

test('目標的範圍：常用的都可以用；自己填的計次 1～200 下、棒式 5～600 秒；自由模式、不認得的動作沒有目標', () => {
    for (const [id, kind] of [['squat', 'reps'], ['pushup', 'reps'], ['lunge', 'reps'], ['plank', 'hold']]) {
        assert.equal(goalKind(id), kind);
        for (const n of GOAL_PRESETS[kind]) assert.equal(validGoal(id, n), true, id + ' ' + n);
        const [min, max] = GOAL_RANGE[kind];
        assert.equal(validGoal(id, min), true);
        assert.equal(validGoal(id, max), true);
        assert.equal(validGoal(id, min - 1), false);
        assert.equal(validGoal(id, max + 1), false);
    }
    assert.deepEqual(GOAL_PRESETS.hold, [10, 20, 30, 40]);
    for (const id of ['free', 'constructor', '__proto__', '', null, 42]) assert.equal(goalKind(id), null, String(id));
    assert.equal(validGoal('squat', 10.5), false);
    assert.equal(validGoal('squat', '10'), false);
});

test('自己填的字：整數才算（全形數字也認得）；空白、小數、負數、太大、亂打的不算', () => {
    assert.equal(parseGoal('plank', '60'), 60);
    assert.equal(parseGoal('plank', ' ６０ '), 60);
    assert.equal(parseGoal('squat', '200'), 200);
    for (const bad of ['', ' ', '0', '201', '9.5', '-5', '1e2', 'abc', '10下', null, undefined, {}, '99999']) {
        assert.equal(parseGoal('squat', bad), null, JSON.stringify(bad));
    }
    assert.equal(parseGoal('plank', '4'), null, '棒式最少 5 秒');
    assert.equal(parseGoal('plank', '601'), null, '棒式最多 10 分鐘');
    assert.equal(parseGoal('free', '10'), null, '自由模式沒有目標');
});

test('存在這台裝置上：每個動作分開記；取消就不見；被改過的值不用（內建的名字也不會被當成動作）', () => {
    store.clear();
    assert.deepEqual(loadGoals(), {});
    saveGoal('plank', 60);
    saveGoal('squat', 15);
    assert.deepEqual(loadGoals(), { squat: 15, plank: 60 });
    saveGoal('squat', null);
    assert.deepEqual(loadGoals(), { plank: 60 });
    saveGoal('plank', 9999);
    assert.deepEqual(loadGoals(), {}, '不對的值當成取消');
    store.set('workoutGoals', JSON.stringify({ squat: 10, plank: '60', pushup: 0, lunge: 5000, free: 10, constructor: 5, toString: 3 }));
    assert.deepEqual(loadGoals(), { squat: 10 });
    store.set('workoutGoals', '{"__proto__": {"squat": 10}}');
    assert.deepEqual(loadGoals(), {});
    for (const bad of ['[10]', '"squat"', '42', 'null', '{壞掉', 'true']) {
        store.set('workoutGoals', bad);
        assert.deepEqual(loadGoals(), {}, bad);
    }
    store.clear();
});

test('棒式目標 60 秒：10～50 秒報時，55～59 秒倒數 5、4、3、2、1，60 秒「時間到」，之後照樣每 10 秒報（70、80）', () => {
    assert.deepEqual(calls(60, 85), ['10:10 秒', '20:20 秒', '30:30 秒', '40:40 秒', '50:50 秒',
        '55:5', '56:4', '57:3', '58:2', '59:1', '60:時間到', '70:70 秒', '80:80 秒']);
});

test('棒式其他目標：倒數蓋過剛好碰到的報時；目標很短也照樣倒數；沒設目標不報時（和以前一樣）', () => {
    assert.deepEqual(calls(25, 31), ['10:10 秒', '20:5', '21:4', '22:3', '23:2', '24:1', '25:時間到', '30:30 秒']);
    assert.deepEqual(calls(5, 11), ['1:4', '2:3', '3:2', '4:1', '5:時間到', '10:10 秒']);
    assert.deepEqual(calls(10, 21), ['5:5', '6:4', '7:3', '8:2', '9:1', '10:時間到', '20:20 秒']);
    assert.deepEqual(calls(null, 70), []);
    assert.deepEqual(calls(0, 70), []);
});

test('棒式報時：手機慢、一格跳過好幾秒時只講現在這一秒（跳過目標也講時間到）；姿勢跑掉秒數停住不重講；起身再趴下重新來', () => {
    const c = new HoldCaller(60);
    const said = s => { const r = c.update(s); return r ? r.text : null; };
    assert.equal(said(0), null);
    assert.equal(said(9.9), null);
    assert.equal(said(10.2), '10 秒');
    assert.equal(said(10.9), null, '同一秒只講一次');
    assert.equal(said(10.9), null, '姿勢跑掉、秒數停住');
    assert.equal(said(56.5), '4', '一格從 10 跳到 56：只講現在這一秒');
    assert.equal(said(61.2), '時間到', '跳過 60 也講時間到');
    assert.equal(said(62), null);
    assert.equal(said(0.5), null, '起身、下一次撐從 0 開始');
    assert.equal(said(10), '10 秒');
    assert.equal(c.done, false);
    assert.equal(said(60), '時間到', '下一次撐到 60 秒再講一次');
    assert.equal(c.done, true);
    assert.equal(c.update(NaN), null);
});

test('計次的動作：做到目標的那一下講「10 下，完成目標」，其他下不講', () => {
    assert.equal(repGoalText(10, 10), '10 下，完成目標');
    assert.equal(repGoalText(9, 10), null);
    assert.equal(repGoalText(11, 10), null, '之後繼續計次，不再講');
    assert.equal(repGoalText(10, null), null);
    assert.equal(goalText('squat', 15), '15 下');
    assert.equal(goalText('plank', 60), '60 秒');
    assert.equal(goalLabel('squat', 15), '目標 15');
    assert.equal(goalLabel('plank', 90), '目標 1:30');
});

test('運動總結：寫有沒有達成、還差多少（棒式看最久的一次，秒數無條件捨去）；存的目標被改過就不寫；不上傳雲端', () => {
    const reps = n => Array.from({ length: n }, (_, i) => ({ min: 85, depth: 'good', errors: [], start: i * 2, end: i * 2 + 1.5 }));
    const squat = summarize('squat', reps(12), 1761000000000, 1761000060000);
    assert.equal(goalLine({ ...squat, goal: 10 }), '目標 10 下：達成');
    assert.equal(goalLine({ ...squat, goal: 15 }), '目標 15 下：還差 3 下');
    assert.ok(describe({ ...squat, goal: 15 }).includes('目標 15 下：還差 3 下'));
    const plank = summarize('plank', [{ seconds: 59.9, errors: [] }, { seconds: 20, errors: [] }], 1761000000000, 1761000060000);
    assert.equal(goalLine({ ...plank, goal: 60 }), '目標 60 秒：還差 1 秒');
    assert.equal(goalLine({ ...plank, goal: 59 }), '目標 59 秒：達成');
    for (const bad of [undefined, null, 0, -5, 10.5, '10', 999, {}, [10]]) {
        assert.equal(goalLine({ ...squat, goal: bad }), null, JSON.stringify(bad));
        assert.ok(!describe({ ...squat, goal: bad }).some(l => l.startsWith('目標')), JSON.stringify(bad));
    }
    const up = cloudSession({ ...squat, goal: 10 });
    assert.ok(up && !('goal' in up), '雲端上傳的白名單沒有目標');
});
