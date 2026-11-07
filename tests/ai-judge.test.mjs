// AI 判斷（11/4）：網站裡的 AI 模型（js/analysis/ai-model.js）和 js/analysis/ai-judge.js
//   模型檔的格式、每個動作都有；網站裡的模型就是這套程式訓練出來的（改了特徵或合成資料要重新產生）；
//   訓練時沒看過的合成受測者猜得準；規則的判斷換成同一個說法；被改壞的不會當掉
import test from 'node:test';
import assert from 'node:assert/strict';
import MODELS from '../js/analysis/ai-model.js';
import { hasAiModel, aiJudge, aiJudgeFeatures, ruleJudge, judgeText, AI_MODEL, seenInTraining, judgeRep, judgeReps, judgeCell, aiLine } from '../js/analysis/ai-judge.js';
import { featureColumns, itemFeatures } from '../js/analysis/features.js';
import { trainModel, modelClasses } from '../js/analysis/forest.js';
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
