// 智慧課表（js/analysis/plan.js，11/14）：照運動紀錄排一套、做完一項換下一項
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const { PLAN_ORDER, PLAN_START, PLAN_RANGE, PLAN_PREP_MS, focusOf, suggestStep, suggestPlan, stepText, planLine, focusText, stepSpeech,
    loadPlanPicks, savePlanPicks, PlanRun } = await import('../js/analysis/plan.js');
const { validSession } = await import('../js/analysis/session.js');
const { validGoal } = await import('../js/analysis/goal.js');

// 一筆計次的紀錄：做了 count 下、clean 下沒有錯誤、good 下到位；errors 每種錯誤幾下
function reps(workout, count, clean = count, good = count, errors = {}, date = 1) {
    const s = { workout, date, minutes: 1, count, clean, errors, good, close: count - good, shallow: 0, best: 80, average: 85, tempo: 2.5, similarity: 90 };
    assert.equal(validSession(s), true, '測試用的紀錄格式要對');
    return s;
}
// 一筆棒式的紀錄：最久 best 秒；clean：沒有錯誤的次數
function hold(best, clean = 1, errors = {}, date = 1) {
    const s = { workout: 'plank', date, minutes: 1, count: 1, clean, errors, seconds: [best], best, total: best };
    assert.equal(validSession(s), true, '測試用的紀錄格式要對');
    return s;
}

test('沒有紀錄：四個動作照固定的順序，用起步的下數；每一項都是可以用的目標', () => {
    const plan = suggestPlan([], {});
    assert.deepEqual(plan.map(s => s.workout), ['squat', 'pushup', 'plank', 'lunge']);
    assert.deepEqual(plan.map(s => s.goal), [10, 8, 20, 10]);
    assert.equal(plan[0].why, '還沒有紀錄，先從 10 下開始');
    assert.equal(plan[2].why, '還沒有紀錄，先從 20 秒開始');
    for (const s of plan) {
        assert.equal(validGoal(s.workout, s.goal), true);
        assert.equal(s.focus, null);
    }
    assert.equal(planLine(plan), '深蹲 10 下 → 伏地挺身 8 下 → 棒式 20 秒 → 弓箭步 10 下');
    assert.deepEqual(PLAN_START, { squat: 10, pushup: 8, plank: 20, lunge: 10 });
});

test('計次的動作：上次做得不錯多一點、錯誤多先少做、普通做一樣多；只看最近一次', () => {
    // 做得不錯（八成以上到位、沒有錯誤）：多一成（至少 1 下）
    assert.deepEqual(suggestStep('squat', [reps('squat', 10)]), { workout: 'squat', goal: 11, why: '上次 10 下、做得不錯，多 1 下', focus: null });
    assert.equal(suggestStep('squat', [reps('squat', 20, 18, 17)]).goal, 22);
    assert.equal(suggestStep('squat', [reps('squat', 20, 18, 17)]).why, '上次 20 下、做得不錯，多 2 下');
    // 一半以上有錯誤：少兩成
    const poor = suggestStep('squat', [reps('squat', 10, 4, 10, { lean: 6 })]);
    assert.equal(poor.goal, 8);
    assert.equal(poor.why, '上次 10 下有 6 下要注意，先少做幾下、把動作做好');
    // 普通（沒到八成、也沒有一半以上錯）：一樣多
    const same = suggestStep('lunge', [reps('lunge', 10, 7, 9, { knee: 3 })]);
    assert.equal(same.goal, 10);
    assert.equal(same.why, '上次 10 下，這次做一樣多、做得更好');
    // 蹲得淺（到位不到八成）也不算做得不錯
    assert.equal(suggestStep('squat', [reps('squat', 10, 10, 5)]).goal, 10);
    // 只看最近一次（紀錄是舊的在前面）；別的動作的紀錄不算
    const history = [reps('squat', 30, 30, 30, {}, 1), reps('pushup', 5, 5, 5, {}, 2), reps('squat', 6, 6, 6, {}, 3)];
    assert.equal(suggestStep('squat', history).goal, 7);
    assert.equal(suggestStep('pushup', history).goal, 6);
    assert.equal(suggestStep('lunge', history).goal, 10);
});

test('計次的範圍 3～30 下：做太少、做很多時，下數和理由對得上', () => {
    assert.deepEqual(PLAN_RANGE, { reps: [3, 30], hold: [10, 120] });
    assert.equal(suggestStep('squat', [reps('squat', 2)]).why, '上次 2 下、做得不錯，多 1 下');
    const few = suggestStep('squat', [reps('squat', 2, 0, 2, { lean: 2 })]);
    assert.equal(few.goal, 3);
    assert.equal(few.why, '上次 2 下，這次試試 3 下');
    const three = suggestStep('squat', [reps('squat', 3, 1, 3, { lean: 2 })]);
    assert.equal(three.goal, 3);
    assert.equal(three.why, '上次 3 下有 2 下要注意，這次做一樣多、把動作做好');
    const cap = suggestStep('squat', [reps('squat', 30)]);
    assert.equal(cap.goal, 30);
    assert.equal(cap.why, '上次 30 下、做得不錯；課表每一項最多 30 下');
    const many = suggestStep('squat', [reps('squat', 50)]);
    assert.equal(many.goal, 30);
    assert.equal(many.why, '上次 50 下；課表每一項最多 30 下');
    assert.equal(suggestStep('squat', [reps('squat', 50, 10, 50, { lean: 40 })]).goal, 30);
    // 每一種情況排出來的都在範圍內、是整數
    for (let n = 1; n <= 60; n++) {
        for (const clean of [0, Math.floor(n / 2), n]) {
            const s = suggestStep('pushup', [reps('pushup', n, clean, n, clean < n ? { sag: n - clean } : {})]);
            assert.ok(Number.isInteger(s.goal) && s.goal >= 3 && s.goal <= 30, n + ' 下 → ' + s.goal);
            assert.ok(typeof s.why === 'string' && s.why.startsWith('上次 ' + n + ' 下'), s.why);
        }
    }
});

test('棒式：看最久的一次，以 5 秒為一格；撐得穩多 5 秒、姿勢有跑掉先撐穩；範圍 10～120 秒', () => {
    assert.deepEqual(suggestStep('plank', [hold(23)]), { workout: 'plank', goal: 25, why: '上次最久 23 秒、撐得穩，這次 25 秒', focus: null });
    assert.equal(suggestStep('plank', [hold(20)]).goal, 25);
    assert.equal(suggestStep('plank', [hold(23.9)]).why, '上次最久 23 秒、撐得穩，這次 25 秒', '秒數無條件捨去，和畫面一樣');
    const loose = suggestStep('plank', [hold(23, 0, { sag: 1 })]);
    assert.equal(loose.goal, 20);
    assert.equal(loose.why, '上次最久 23 秒、姿勢有跑掉，這次 20 秒、撐穩一點');
    assert.equal(suggestStep('plank', [hold(20, 0, { pike: 1 })]).why, '上次最久 20 秒、姿勢有跑掉，這次 20 秒、撐穩一點');
    // 太短：最少 10 秒（最後 5 秒要倒數）
    assert.equal(suggestStep('plank', [hold(6)]).why, '上次最久 6 秒，這次試試 10 秒');
    assert.equal(suggestStep('plank', [hold(6, 0, { sag: 1 })]).goal, 10);
    // 很久：最多 120 秒
    assert.equal(suggestStep('plank', [hold(118)]).why, '上次最久 118 秒、撐得穩，這次 120 秒');
    assert.equal(suggestStep('plank', [hold(120)]).why, '上次最久 120 秒、撐得穩；課表每一項最多 120 秒');
    assert.equal(suggestStep('plank', [hold(300, 0, { sag: 1 })]).why, '上次最久 300 秒；課表每一項最多 120 秒');
    for (let sec = 1; sec <= 400; sec += 3) {
        for (const clean of [0, 1]) {
            const s = suggestStep('plank', [hold(sec, clean, clean ? {} : { sag: 1 })]);
            assert.ok(s.goal >= 10 && s.goal <= 120 && s.goal % 5 === 0, sec + ' 秒 → ' + s.goal);
        }
    }
});

test('「目標」卡片設了目標的動作照使用者設的；設得不對的（被改過）不理', () => {
    const history = [reps('squat', 10)];
    assert.deepEqual(suggestStep('squat', history, { squat: 15 }), { workout: 'squat', goal: 15, why: '照你設的目標', focus: null });
    assert.equal(suggestStep('plank', [], { plank: 45 }).goal, 45);
    assert.equal(suggestStep('squat', history, { squat: 9999 }).goal, 11);
    assert.equal(suggestStep('squat', history, { squat: '15' }).goal, 11);
    assert.equal(suggestStep('squat', history, null).goal, 11);
    // 別的動作的目標不影響
    assert.equal(suggestStep('squat', history, { pushup: 20 }).goal, 11);
});

test('弱點提醒：最近 3 次同一種錯誤加起來 2 下以上，挑最多的那一種；不認得的錯誤代號不算', () => {
    const history = [
        reps('squat', 10, 9, 10, { lean: 1 }, 1),          // 第 4 舊：不看
        reps('squat', 10, 8, 10, { heel: 2 }, 2),
        reps('squat', 10, 7, 10, { lean: 3 }, 3),
        reps('squat', 10, 9, 10, { lean: 1, heel: 1 }, 4)
    ];
    assert.deepEqual(focusOf('squat', history), { id: 'lean', count: 4, sessions: 3 });
    const step = suggestStep('squat', history);
    assert.equal(focusText(step), '最近 3 次有 4 下上身前傾');
    assert.equal(stepSpeech(step, true), '課表開始：深蹲 11 下，記得胸口挺起來');
    assert.equal(stepSpeech(step, false), '下一個：深蹲 11 下，記得胸口挺起來');
    // 只出現 1 下：不提醒（可能是偵測跳一下）
    assert.equal(focusOf('squat', [reps('squat', 10, 9, 10, { lean: 1 })]), null);
    assert.equal(focusText(suggestStep('squat', [reps('squat', 10, 8, 10, { lean: 2 })])), '上次有 2 下上身前傾');
    // 棒式的單位是「次」
    assert.equal(focusText(suggestStep('plank', [hold(20, 0, { sag: 1 }, 1), hold(20, 0, { sag: 1 }, 2)])), '最近 2 次有 2 次塌腰');
    // 紀錄被改過：不是這個動作的規則、JavaScript 內建的名字、不是整數的次數都不算
    const bad = [reps('squat', 10, 5, 10, { knee: 5, constructor: 9, __proto__: 9, toString: 9 })];
    assert.equal(focusOf('squat', bad), null);
    const odd = { ...reps('squat', 10, 5, 10, {}), errors: { lean: 2.5, heel: -3 } };
    assert.equal(focusOf('squat', [odd]), null);
    // 沒有弱點：只講這一項要做什麼
    assert.equal(stepSpeech(suggestStep('pushup', []), false), '下一個：伏地挺身 8 下');
    assert.equal(stepSpeech(suggestStep('plank', []), true), '課表開始：棒式 20 秒');
});

test('不是課表裡的動作、壞掉的紀錄：不出錯', () => {
    for (const id of ['free', 'constructor', '__proto__', '', null, undefined, 42]) assert.equal(suggestStep(id, [], {}), null, String(id));
    assert.equal(suggestStep('squat', null).goal, 10);
    assert.equal(suggestStep('squat', 'abc').goal, 10);
    assert.equal(suggestStep('squat', [null, undefined, 3, 'x']).goal, 10);
    assert.equal(focusOf('squat', [{ workout: 'squat' }]), null);
});

test('勾選要做哪幾項：照固定的順序、會記住；存的值被改過就當四項都做', () => {
    store.clear();
    assert.deepEqual(loadPlanPicks(), PLAN_ORDER);
    assert.deepEqual(savePlanPicks(['lunge', 'squat']), ['squat', 'lunge']);
    assert.deepEqual(loadPlanPicks(), ['squat', 'lunge']);
    assert.deepEqual(suggestPlan([], {}, loadPlanPicks()).map(s => s.workout), ['squat', 'lunge']);
    for (const raw of ['{"squat":true}', '"squat"', '[]', '["free","constructor"]', '[1,2]', 'not json', 'null']) {
        store.set('planPicks', raw);
        assert.deepEqual(loadPlanPicks(), PLAN_ORDER, raw);
    }
    store.set('planPicks', '["plank","hack","plank"]');
    assert.deepEqual(loadPlanPicks(), ['plank']);
    // picks 不是陣列：四項都排；裡面不認得的不理
    assert.equal(suggestPlan([], {}, 'squat').length, 4);
    assert.deepEqual(suggestPlan([], {}, ['pushup', 'nope']).map(s => s.workout), ['pushup']);
    assert.deepEqual(savePlanPicks(null), []);
});

test('課表進行：做到了換下一項、換過去先準備幾秒、最後一項做完就結束；卡片的字', () => {
    const steps = suggestPlan([], {}, ['squat', 'pushup', 'plank']);
    const run = new PlanRun(steps);
    assert.equal(run.finished, false);
    assert.equal(stepText(run.step), '深蹲 10 下');
    assert.equal(stepText(run.next), '伏地挺身 8 下');
    assert.equal(run.preparing(0), false, '第一項不用準備');
    assert.equal(run.began(0), false);
    assert.equal(run.cardText(0), '第 1／3 項：深蹲 10 下；做到了自動換伏地挺身');
    // 還沒做到、別的動作的次數都不算做到
    assert.equal(run.reached('squat', 9), false);
    assert.equal(run.reached('pushup', 10), false);
    assert.equal(run.reached('squat', NaN), false);
    assert.equal(run.reached('squat', 10), true);
    // 錄製中不能換：先記著（這時不會再說一次做到了）
    run.waiting = true;
    assert.equal(run.reached('squat', 11), false);
    assert.equal(run.cardText(0, true), '第 1／3 項：深蹲 10 下做到了；錄製中不能換下一項（先停止錄製）');
    // 換下一項：準備 PLAN_PREP_MS，卡片倒數（無條件進位，最少寫 1 秒）
    assert.equal(stepText(run.advance(1000)), '伏地挺身 8 下');
    assert.equal(run.waiting, false);
    assert.equal(run.preparing(1000), true);
    assert.equal(run.cardText(1000), '第 2／3 項：伏地挺身 8 下，' + PLAN_PREP_MS / 1000 + ' 秒後開始數');
    assert.equal(run.cardText(1000 + PLAN_PREP_MS - 100), '第 2／3 項：伏地挺身 8 下，1 秒後開始數');
    assert.equal(run.began(1000 + PLAN_PREP_MS - 1), false);
    assert.equal(run.began(1000 + PLAN_PREP_MS), true, '準備結束的那一格');
    assert.equal(run.began(1000 + PLAN_PREP_MS + 50), false, '只提醒一次');
    assert.equal(run.preparing(1000 + PLAN_PREP_MS), false);
    assert.equal(run.cardText(9000), '第 2／3 項：伏地挺身 8 下；做到了自動換棒式');
    // 棒式是秒數
    run.advance(20000);
    assert.equal(run.reached('plank', 19.9), false);
    assert.equal(run.reached('plank', 20), true);
    assert.equal(run.next, null);
    assert.equal(run.cardText(20000 + PLAN_PREP_MS), '第 3／3 項：棒式 20 秒；最後一項');
    // 最後一項做完：結束
    assert.equal(run.advance(50000), null);
    assert.equal(run.finished, true);
    assert.equal(run.step, null);
    assert.equal(run.next, null);
    assert.equal(run.reached('plank', 99), false);
    assert.equal(run.preparing(50000), false);
    assert.equal(run.began(60000), false);
    assert.equal(run.cardText(60000), '課表完成：深蹲 10 下 → 伏地挺身 8 下 → 棒式 20 秒；按「結束」看總結');
    assert.equal(run.advance(70000), null, '結束之後再叫也不出錯');
});

test('課表進行：卡片寫弱點；空的課表一開始就是結束', () => {
    const history = [reps('squat', 10, 8, 10, { lean: 2 })];
    const run = new PlanRun(suggestPlan(history, {}, ['squat']));
    assert.equal(run.cardText(0), '第 1／1 項：深蹲 11 下；上次有 2 下上身前傾；最後一項');
    for (const empty of [[], null, undefined, [null]]) {
        const none = new PlanRun(empty);
        assert.equal(none.finished, true);
        assert.equal(none.step, null);
    }
});
