// 錯誤說出原因（10/19）：「上身前傾 58°，超過 50° 算上身前傾」
// 顯示的數字和判斷用同一個量、只換單位；每一下記下最嚴重的數字；總結寫出來；被改過的紀錄不會出錯
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../js/skeleton/landmarks.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { FORM_RULES, whyText, errorRule, bendDegrees } from '../js/analysis/form.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { summarize, describe } from '../js/analysis/session.js';
import { demoLandmarks, random } from './helpers.mjs';

test('每一條規則都說得出原因，而且「數字超過門檻」和判斷做錯一致', () => {
    const rnd = random(20261019);
    for (const [workout, rules] of Object.entries(FORM_RULES)) {
        for (const rule of rules) {
            assert.ok(rule.why && rule.why.label && rule.why.unit && Number.isFinite(rule.why.limit), workout + ' ' + rule.id);
            for (let k = 0; k < 2000; k++) {
                const m = { lean: rnd() * 90, heel: rnd() * 0.8 - 0.2, sag: rnd() * 0.6 - 0.3, kneePast: rnd() * 0.7 - 0.3 };
                const v = rule.why.value(m);
                if (Math.abs(v - rule.why.limit) < 1e-9) continue;   // 剛好在門檻上：差在浮點數，不比
                assert.equal(rule.bad(m), v > rule.why.limit, `${workout} ${rule.id} ${JSON.stringify(m)} → ${v}`);
            }
            // 算不出來（看不到那幾個點）：沒有數字，也不算做錯
            const none = { lean: null, heel: null, sag: null, kneePast: null };
            assert.equal(rule.why.value(none), null);
            assert.equal(rule.bad(none), false);
        }
    }
});

test('說出原因的句子：四捨五入到整數，度和 % 都寫門檻', () => {
    const squat = errorRule('squat', 'lean');
    assert.equal(whyText(squat, 58.4), '上身前傾 58°，超過 50° 算上身前傾');
    assert.equal(whyText(errorRule('squat', 'heel'), 17.6), '腳跟比站直時高 18%，超過 14% 算腳跟離地');
    assert.equal(whyText(errorRule('plank', 'sag'), 18.2), '腰往下彎 18°，超過 16° 算塌腰');
    assert.equal(whyText(errorRule('pushup', 'pike'), 23), '屁股往上翹 23°，超過 20° 算屁股太高');
    assert.equal(whyText(errorRule('lunge', 'knee'), 15.4), '前膝比腳尖前面 15%，超過 10% 算膝超過腳尖');
    for (const bad of [null, undefined, NaN, Infinity, '60']) assert.equal(whyText(squat, bad), '', String(bad));
    // 身體彎的角度：和 hipSag 說明的換算一樣（0.07 約 16°、0.09 約 20°），直的是 0°
    assert.equal(Math.round(bendDegrees(0.07)), 16);
    assert.equal(Math.round(bendDegrees(0.09)), 20);
    assert.equal(bendDegrees(0), 0);
});

test('找規則：動作、代號被改過（例如 constructor）時找不到，不會查到 JavaScript 內建的東西', () => {
    assert.equal(errorRule('squat', 'lean').id, 'lean');
    assert.equal(errorRule('lunge', 'lean').why.limit, 30, '同一個代號，動作不同門檻不同');
    for (const [w, id] of [['constructor', 'lean'], ['squat', 'constructor'], ['__proto__', 'lean'], ['free', 'lean'], ['squat', 'sag']]) {
        assert.equal(errorRule(w, id), null, w + ' ' + id);
    }
});

// 深蹲越蹲越前傾（最低點約 70°）：用示範動畫的骨架跑三下
const W = 640, H = 480;
const both = name => [P['LEFT_' + name], P['RIGHT_' + name]];
function leanSquat(extra) {
    return (lm, d) => {
        const hip = lm[P.LEFT_HIP];
        return lm.map((p, i) => {
            if (![...both('SHOULDER'), P.NOSE, ...both('EAR'), ...both('EYE'), ...both('ELBOW'), ...both('WRIST')].includes(i)) return p;
            const dx = (p.x - hip.x) * W, dy = (p.y - hip.y) * H;
            const a = d * extra * Math.PI / 180;
            return { ...p, x: hip.x + (dx * Math.cos(a) - dy * Math.sin(a)) / W, y: hip.y + (dx * Math.sin(a) + dy * Math.cos(a)) / H };
        });
    };
}
function runReps(extras) {
    const pipeline = new PosePipeline();
    const tracker = new WorkoutTracker('squat');
    tracker.useBaseline({ knee: 175, tilt: 0 });   // 不等站直校正，直接算
    let t = 0;
    const step = (d, edit) => tracker.update(pipeline.process(edit(demoLandmarks('squat', d), d), t += 33, W, H), t);
    const still = lm => lm;
    for (let i = 0; i < 20; i++) step(0, still);
    for (const extra of extras) {
        const edit = leanSquat(extra);
        for (let i = 0; i <= 30; i++) step(i / 30, edit);
        for (let i = 0; i < 20; i++) step(1, edit);
        for (let i = 30; i >= 0; i--) step(i / 30, edit);
        for (let i = 0; i < 30; i++) step(0, still);
    }
    return tracker.items;
}

test('每一下記下最嚴重的數字；沒有錯的那一下沒有；總結取最嚴重的那一下並寫出原因', () => {
    const reps = runReps([40, 0, 25]);
    assert.equal(reps.length, 3);
    assert.deepEqual(reps.map(r => r.errors), [['lean'], [], ['lean']]);
    assert.ok(reps[0].peaks.lean >= 60 && reps[0].peaks.lean <= 75, '前傾 40°（加上示範本身約 30°）：' + reps[0].peaks.lean);
    assert.ok(Number.isInteger(reps[0].peaks.lean), '存整數');
    assert.deepEqual(reps[1].peaks, {});
    assert.ok(reps[2].peaks.lean > 50 && reps[2].peaks.lean < reps[0].peaks.lean, '前傾少一點的那一下數字比較小：' + reps[2].peaks.lean);
    const s = summarize('squat', reps, 0, 60000);
    assert.equal(s.peaks.lean, reps[0].peaks.lean);
    assert.ok(describe(s).includes('最嚴重的一下：上身前傾 ' + s.peaks.lean + '°，超過 50° 算上身前傾'), describe(s).join(' / '));
});

test('總結：沒有 peaks 的舊紀錄、被改過的 peaks 都不會出錯，只是不寫原因', () => {
    const base = { workout: 'squat', date: 0, minutes: 1, count: 2, clean: 1, errors: { lean: 1 }, good: 2, close: 0, shallow: 0, best: 85, average: 90, tempo: 2 };
    const lines = p => describe({ ...base, ...(p === undefined ? {} : { peaks: p }) });
    assert.ok(!lines(undefined).some(l => l.startsWith('最嚴重')), '舊紀錄');
    for (const bad of [null, 'x', [], { lean: '60' }, { lean: NaN }, { lean: null }, { heel: 30 }, JSON.parse('{"__proto__": {"lean": 60}}')]) {
        assert.ok(!lines(bad).some(l => l.startsWith('最嚴重')), JSON.stringify(bad));
    }
    assert.ok(lines({ lean: 61 }).includes('最嚴重的一下：上身前傾 61°，超過 50° 算上身前傾'));
    // 沒有錯誤的那一組不會有 peaks 欄位（雲端也不會收到，見 js/cloud/sync.js 的白名單）
    assert.equal(summarize('squat', [{ min: 85, depth: 'good', errors: [], start: 0, end: 2 }], 0, 1).peaks, undefined);
});

// 伏地挺身（11/10 實體測試，真人）：兩下之間撐在上面休息時屁股翹高，放平之後紅字還會多留 0.6 秒（form.js 的 FORM_HOLD.hideMs）；
// 這時馬上做下一下（平的），那一下不算屁股太高。以前會算，而且記下的數字比門檻低：總結寫「屁股往上翹 8°，超過 20° 算屁股太高」
// plan：['top', 幾格]（撐在上面、平的）、['pikeTop', 幾格]（撐在上面、屁股翹高）、['rep']（平的一下）、['pikeRep']（整下屁股翹高）
function pushups(plan) {
    const pipeline = new PosePipeline();
    const tracker = new WorkoutTracker('pushup');
    let t = 0;
    // 屁股抬高畫面高度的 0.08（膝蓋抬一半）：約 28°，超過 20° 算屁股太高
    const raise = lm => lm.map((p, i) => (both('HIP').includes(i) ? { ...p, y: p.y - 0.08 } : both('KNEE').includes(i) ? { ...p, y: p.y - 0.04 } : p));
    const step = (d, pike) => {
        const lm = demoLandmarks('pushup', d);
        tracker.update(pipeline.process(pike ? raise(lm) : lm, t += 33, W, H), t);
    };
    for (const [kind, n] of plan) {
        if (kind === 'top' || kind === 'pikeTop') {
            for (let i = 0; i < n; i++) step(0, kind === 'pikeTop');
            continue;
        }
        const pike = kind === 'pikeRep';
        for (let i = 0; i <= 30; i++) step(i / 30, pike);
        for (let i = 0; i < 10; i++) step(1, pike);
        for (let i = 30; i >= 0; i--) step(i / 30, pike);
    }
    return tracker.items;
}

test('兩下之間做錯、紅字還沒收起來就做下一下：那一下不算做錯；記下的最嚴重數字一定超過門檻', () => {
    // 第 1 下平的 → 撐著休息 1 秒、屁股翹高 → 放平 0.17 秒就做第 2 下（平的）→ 第 3 下整下屁股翹高
    const reps = pushups([['top', 20], ['rep'], ['pikeTop', 30], ['top', 5], ['rep'], ['top', 30], ['pikeRep'], ['top', 30]]);
    assert.equal(reps.length, 3);
    assert.deepEqual(reps.map(r => r.errors), [[], [], ['pike']]);
    const limit = errorRule('pushup', 'pike').why.limit;
    assert.ok(reps[2].peaks.pike > limit, '整下屁股太高，記下的數字超過門檻：' + reps[2].peaks.pike);
    const s = summarize('pushup', reps, 0, 60000);
    assert.ok(describe(s).includes('最嚴重的一下：屁股往上翹 ' + reps[2].peaks.pike + '°，超過 20° 算屁股太高'), describe(s).join(' / '));
});
