// AI 判斷（11/4）：網站裡的 AI 模型（js/analysis/ai-model.js）和 js/analysis/ai-judge.js
//   模型檔的格式、每個動作都有；網站裡的模型就是這套程式訓練出來的（改了特徵或合成資料要重新產生）；
//   訓練時沒看過的合成受測者猜得準；規則的判斷換成同一個說法；被改壞的不會當掉
import test from 'node:test';
import assert from 'node:assert/strict';
import MODELS from '../js/analysis/ai-model.js';
import { hasAiModel, aiJudge, aiJudgeFeatures, ruleJudge, judgeText, AI_MODEL, seenInTraining, judgeRep, judgeReps, judgeCell, aiLine, repScore, scoreLine, aiLimit, explainRep, explainLine } from '../js/analysis/ai-judge.js';
import { featureColumns, itemFeatures } from '../js/analysis/features.js';
import { trainModel, modelClasses, predictModel } from '../js/analysis/forest.js';
import { analyzeOne } from '../js/data/report-core.js';
import { buildDataset } from '../tools/dataset.mjs';
import { syntheticSet, syntheticSubject } from './synthetic-sets.mjs';

test('模型檔：四個動作各一個，特徵、標記照 features.js、form.js；寫明是合成資料訓練的', () => {
    assert.equal(MODELS.version, 1);
    assert.deepEqual(MODELS.models.map(m => m.workout), ['squat', 'lunge', 'pushup', 'plank']);
    for (const m of MODELS.models) {
        assert.equal(m.type, 'random-forest');
        assert.deepEqual(m.features, featureColumns(m.workout).map(c => c.key));
        assert.deepEqual(m.classes, modelClasses(m.workout));
        assert.equal(m.trees.length, 100);
        assert.ok(hasAiModel(m.workout));
    }
    for (const id of ['free', 'constructor', '__proto__', '', null]) assert.equal(hasAiModel(id), false);
    assert.equal(AI_MODEL.synthetic, true);
    assert.deepEqual(AI_MODEL.subjects, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
});

// 改了特徵、合成資料或訓練的程式卻沒重新產生 ai-model.js，網站上的 AI 判斷就和訓練時比的不一樣：這裡重新訓練一次比對
test('網站裡的模型就是這套程式訓練出來的（不一樣就要重新產生：node tools/train.mjs --synthetic A,B,C,D,E,F,G,H --cv --module js/analysis/ai-model.js）', async () => {
    const { rows } = await buildDataset(MODELS.subjects.flatMap(s => syntheticSubject(s)));
    for (const m of MODELS.models) assert.equal(JSON.stringify(trainModel(m.workout, rows)), JSON.stringify(m), m.workout);
});

test('訓練時沒看過的合成受測者（K）：AI 判斷猜得準；和直接用特徵猜的一樣', async () => {
    let hit = 0, n = 0;
    for (const set of syntheticSubject('K')) {
        const r = await analyzeOne(set.text);
        for (const item of r.items) {
            const j = aiJudge(r.info.workout, item);
            assert.ok(j.confidence > 0 && j.confidence <= 1);
            assert.ok(modelClasses(r.info.workout).includes(j.label));
            n++;
            if (j.label === r.info.condition) hit++;
        }
    }
    assert.equal(n, 63);
    assert.ok(hit >= 55, hit + '／63');
    // 被改壞的一下、不認得的動作
    assert.equal(aiJudge('free', {}), null);
    assert.equal(aiJudge('constructor', {}), null);
    for (const item of [null, 'x', {}, { features: 'lean' }, { min: '90', features: { lean: '60' } }]) {
        const j = aiJudge('squat', item);
        assert.ok(['good', 'lean', 'heel'].includes(j.label));
    }
    assert.deepEqual(aiJudgeFeatures('squat', { lean: 70, heel: 0 }), aiJudge('squat', { features: { lean: 70, heel: 0 } }));
});

test('規則的判斷：沒報錯是做對；好幾種取超過門檻最多的；不認得的代號不算；中文', () => {
    assert.equal(ruleJudge('squat', [], {}), 'good');
    assert.equal(ruleJudge('squat', ['heel'], { heel: 20 }), 'heel');
    assert.equal(ruleJudge('squat', ['lean', 'heel'], { lean: 55, heel: 21 }), 'heel');
    assert.equal(ruleJudge('squat', ['lean', 'heel'], { lean: 75, heel: 15 }), 'lean');
    assert.equal(ruleJudge('squat', ['constructor', 'knee'], {}), 'good');
    assert.equal(ruleJudge('squat', 'lean', null), 'good');
    assert.equal(ruleJudge('plank', ['pike', 'sag'], { sag: 30, pike: -30 }), 'sag');
    assert.equal(judgeText('good'), '做對');
    assert.equal(judgeText('heel'), '腳跟離地');
});

test('訓練時看過的受測者：同一個代號、同樣是合成的才算', () => {
    assert.equal(seenInTraining('A', true), true);
    assert.equal(seenInTraining('A', false), false);
    assert.equal(seenInTraining('K', true), false);
    assert.equal(seenInTraining('constructor', true), false);
});

test('一組的 AI 判斷（11/7：重播分析、運動中的提示、運動總結共用）：每一下 AI 和規則各判成什麼', async () => {
    const r = await analyzeOne(syntheticSet('K', 'squat', 'heel', 1).text);
    const judged = judgeReps('squat', r.items);
    assert.equal(judged.length, 5);
    judged.forEach((j, i) => {
        const it = r.items[i];
        // 運動中每一下的提示（judgeRep）和一組一起算（judgeReps）一樣；和分開算 AI、規則也一樣
        assert.deepEqual(judgeRep('squat', it), j);
        assert.deepEqual(j.ai, aiJudge('squat', it));
        assert.equal(j.rule, ruleJudge('squat', it.errors, itemFeatures('squat', it)));
    });
    // 沒有模型的動作、不認得的動作、不是陣列：null
    assert.equal(judgeRep('free', r.items[0]), null);
    assert.equal(judgeRep('constructor', r.items[0]), null);
    assert.equal(judgeReps('constructor', r.items), null);
    assert.equal(judgeReps('squat', 'x'), null);
    // 被改壞的一下也有判斷（規則沒報錯就是做對）
    assert.equal(judgeRep('squat', null).rule, 'good');
    // 一下的寫法：判斷（把握，四捨五入的 %）
    assert.equal(judgeCell({ label: 'heel', confidence: 0.934 }), '腳跟離地（93%）');
    assert.equal(judgeCell({ label: 'good', confidence: 1 }), '做對（100%）');
});

test('AI 判斷那一句（11/7）：各判成幾下照模型的標記順序、和規則不一樣的寫第幾下；棒式的單位是「次」', () => {
    const reps = [1, 2, 3, 4, 5].map(n => ({ n }));
    const j = (ai, rule) => ({ ai: { label: ai, confidence: 0.9 }, rule });
    assert.equal(aiLine('squat', reps, [j('heel', 'heel'), j('good', 'good'), j('heel', 'good'), j('good', 'good'), j('lean', 'lean')]),
        'AI 判斷（示範：模型是用合成資料訓練的，不是真人）：做對 2 下、上身前傾 1 下、腳跟離地 2 下；和規則一樣 4 下、不一樣 1 下（第 3 下）');
    assert.equal(aiLine('plank', reps.slice(0, 2), [j('sag', 'sag'), j('sag', 'pike')]),
        'AI 判斷（示範：模型是用合成資料訓練的，不是真人）：塌腰 2 次；和規則一樣 1 次、不一樣 1 次（第 2 次）');
    // 第幾下用每一下自己的編號（重播只錄到後面幾下時，從錄到的那一下開始數）
    assert.equal(aiLine('pushup', [{ n: 7 }, { n: 8 }], [j('pike', 'good'), j('good', 'good')]),
        'AI 判斷（示範：模型是用合成資料訓練的，不是真人）：做對 1 下、屁股太高 1 下；和規則一樣 1 下、不一樣 1 下（第 7 下）');
    // 沒有判斷、對不上、不認得的動作：空字串（畫面上收起來）
    assert.equal(aiLine('squat', [], []), '');
    assert.equal(aiLine('squat', reps, null), '');
    assert.equal(aiLine('squat', reps.slice(0, 2), [j('good', 'good')]), '');
    assert.equal(aiLine('constructor', reps.slice(0, 1), [j('good', 'good')]), '');
    assert.equal(aiLine('free', reps.slice(0, 1), [j('good', 'good')]), '');
});

test('AI 動作評分（11/10）：每一下 = AI 覺得做對的把握 × 相似度（棒式、算不出相似度只看把握）；一組的那一句；合成受測者 K 做對的高、故意做錯的低', async () => {
    assert.equal(repScore({ similarity: 96 }, { good: 0.98 }), 94);
    assert.equal(repScore({ similarity: 90 }, { good: 0.03 }), 3);
    assert.equal(repScore({}, { good: 0.876 }), 88);
    assert.equal(repScore({ similarity: null }, { good: 0.5 }), 50);
    assert.equal(repScore({ similarity: 150 }, { good: 2 }), 100, '被改壞的數字夾在範圍裡');
    assert.equal(repScore(null, { good: 0.5 }), 50);
    for (const bad of [null, {}, { good: NaN }, { good: '1' }, { good: Infinity }]) assert.equal(repScore({ similarity: 90 }, bad), null);
    const reps = [{ n: 1, similarity: 96 }, { n: 2, similarity: 90 }, { n: 3, similarity: 95 }];
    const judged = [{ ai: { good: 0.98 } }, { ai: { good: 0.03 } }, { ai: { good: 1 } }];
    assert.equal(scoreLine('squat', reps, judged), 'AI 評分（每一下 0～100 分：AI 覺得做對的把握 × 和示範動作有多像）：平均 64 分；最好第 3 下 95 分、最差第 2 下 3 分');
    assert.equal(scoreLine('plank', [{ n: 1 }], [{ ai: { good: 0.9 } }]), 'AI 評分（每一次 0～100 分：AI 覺得做對的把握）：90 分');
    assert.equal(scoreLine('squat', [{ n: 4, similarity: 90 }, { n: 5, similarity: 90 }], [{ ai: { good: 1 } }, { ai: { good: 1 } }]),
        'AI 評分（每一下 0～100 分：AI 覺得做對的把握 × 和示範動作有多像）：每一下都是 90 分');
    // 沒有編號的（實測報表的資料）照順序
    assert.match(scoreLine('squat', [{ similarity: 90 }, { similarity: 50 }], [{ ai: { good: 1 } }, { ai: { good: 1 } }]), /最好第 1 下 90 分、最差第 2 下 50 分$/);
    // 沒有模型的動作、對不上、空的、不認得的動作
    for (const [id, r, j] of [['free', reps, judged], ['squat', reps, judged.slice(1)], ['squat', [], []], ['constructor', reps, judged], ['squat', reps, null]]) {
        assert.equal(scoreLine(id, r, j), '');
    }
    // 合成受測者 K（訓練時沒看過）：做對的那組平均比故意腳跟離地的那組高很多
    const avg = async (id, condition) => {
        const r = await analyzeOne(syntheticSet('K', id, condition, 1).text);
        const j = judgeReps(id, r.items);
        const v = r.items.map((it, i) => repScore(it, j[i].ai));
        return v.reduce((a, b) => a + b, 0) / v.length;
    };
    const good = await avg('squat', 'good'), heel = await avg('squat', 'heel');
    assert.ok(good >= 60 && heel <= 20, good + ' / ' + heel);
    assert.ok(await avg('pushup', 'good') >= 90 && await avg('pushup', 'sag') <= 10);
});

test('AI 解釋（11/11）：AI 的界線和一格一格試的一樣；判成錯誤、做對、看不到的寫法；一組最差的那一下', async () => {
    // 一格一格試（0.1 一格，最多規則門檻的 3 倍）：和 aiLimit 只試門檻旁邊那一格的結果要一樣
    const MIRROR = { sag: 'pike', pike: 'sag' };
    const scan = (id, f, e) => {
        const model = MODELS.models.find(m => m.workout === id);
        const limit = { squat: { lean: 50, heel: 14 }, lunge: { lean: 30, knee: 10 } }[id];
        const top = limit ? Math.round(limit[e] * 30) : 3000;
        for (let i = 0; i <= top; i++) {
            const x = { ...f, [e]: i / 10 };
            if (MIRROR[e]) x[MIRROR[e]] = -i / 10;
            if (predictModel(model, x).label === e) return i / 10;
        }
        return null;
    };
    let checked = 0;
    for (const [id, c] of [['squat', 'good'], ['squat', 'heel'], ['lunge', 'knee'], ['pushup', 'sag'], ['plank', 'pike']]) {
        const r = await analyzeOne(syntheticSet('K', id, c, 1).text);
        for (const it of r.items) {
            const f = itemFeatures(id, it);
            for (const e of modelClasses(id).slice(1)) {
                const fast = aiLimit(id, f, e), slow = scan(id, f, e);
                if (id === 'squat' || id === 'lunge') assert.equal(fast, slow, id + ' ' + e);
                else assert.ok(fast === slow || (fast === null && slow > 0), id + ' ' + e + ' ' + fast + ' ' + slow);
                checked++;
            }
        }
    }
    assert.ok(checked >= 50);
    assert.equal(aiLimit('free', {}, 'lean'), null);
    assert.equal(aiLimit('squat', {}, 'constructor'), null);
    assert.equal(aiLimit('squat', {}, 'knee'), null, '深蹲沒有膝超過腳尖');
    // 寫法：判成腳跟離地；判成做對（每一種錯誤的數字和界線）；看不到那個數字
    const heel = { features: { lean: 30, heel: 25 } };
    const limit = aiLimit('squat', heel.features, 'heel');
    assert.equal(explainRep('squat', heel, { label: 'heel' }), '腳跟比站直時高 25%，AI 覺得超過約 ' + Math.round(limit) + '% 就算腳跟離地（規則是 14%）');
    assert.match(explainRep('squat', { features: { lean: 20, heel: 2 } }, { label: 'good' }), /^上身前傾 20°（AI 覺得超過約 \d+° 才算上身前傾）、腳跟比站直時高 2%（約 \d+%）$/);
    assert.equal(explainRep('squat', { features: { lean: 70, heel: null } }, { label: 'heel' }), '看不到腳跟比站直時高，AI 是看其他數字判成腳跟離地的');
    assert.match(explainRep('squat', { features: { lean: 20, heel: null } }, { label: 'good' }), /、腳跟比站直時高看不到$/);
    for (const [id, ai] of [['free', { label: 'good' }], ['squat', null], ['squat', { label: 'knee' }]]) assert.equal(explainRep(id, heel, ai), '');
    // 一組：分數最差的那一下（合成受測者 K 故意腳跟離地）
    const r = await analyzeOne(syntheticSet('K', 'squat', 'heel', 1).text);
    const judged = judgeReps('squat', r.items);
    const scores = r.items.map((it, i) => repScore(it, judged[i].ai));
    const worst = scores.indexOf(Math.min(...scores));
    assert.equal(explainLine('squat', r.items, judged), 'AI 解釋（最差的第 ' + (worst + 1) + ' 下，判成' + judgeText(judged[worst].ai.label) + '）：' + explainRep('squat', r.items[worst], judged[worst].ai));
    assert.match(explainLine('plank', [{ n: 1, features: { sag: 0, pike: 1 } }], [{ ai: { label: 'good', good: 1 } }]), /^AI 解釋（第 1 次，判成做對）：/);
    for (const [id, reps, j] of [['free', r.items, judged], ['squat', r.items, judged.slice(1)], ['squat', [], []], ['squat', r.items, null]]) assert.equal(explainLine(id, reps, j), '');
});
