// AI 判斷（11/4）：網站裡的 AI 模型（js/analysis/ai-model.js）和 js/analysis/ai-judge.js
//   模型檔的格式、每個動作都有；網站裡的模型就是這套程式訓練出來的（改了特徵或合成資料要重新產生）；
//   訓練時沒看過的合成受測者猜得準；規則的判斷換成同一個說法；被改壞的不會當掉
import test from 'node:test';
import assert from 'node:assert/strict';
import MODELS from '../js/analysis/ai-model.js';
import { hasAiModel, aiJudge, aiJudgeFeatures, ruleJudge, judgeText, AI_MODEL, seenInTraining } from '../js/analysis/ai-judge.js';
import { featureColumns } from '../js/analysis/features.js';
import { trainModel, modelClasses } from '../js/analysis/forest.js';
import { analyzeOne } from '../js/data/report-core.js';
import { buildDataset } from '../tools/dataset.mjs';
import { syntheticSubject } from './synthetic-sets.mjs';

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
