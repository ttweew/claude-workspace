// AI 模型和規則、DTW 比（11/3）：tools/evaluate.mjs（規則、DTW 的判斷、成績、模型學到的門檻）、tools/train.mjs（訓練＋比較、命令列）
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rulePrediction, fitSimilarity, similarityPrediction, score, ratio, learnedLimit } from '../tools/evaluate.mjs';
import { compareOne, compareAll, addScores, resultLines } from '../tools/train.mjs';
import { buildDataset } from '../tools/dataset.mjs';
import { splitBySubject } from '../tools/split.mjs';
import { trainModel } from '../js/analysis/forest.js';
import { syntheticSubject } from './synthetic-sets.mjs';

const row = (workout, condition, features, ruleErrors = []) => ({ workout, condition, features, ruleErrors, subject: 'A', file: 'x.json' });

test('規則的判斷：沒報錯是做對；報了好幾種取超過門檻最多的；不認得的代號不算', () => {
    assert.equal(rulePrediction(row('squat', 'good', { lean: 30, heel: 2 })), 'good');
    assert.equal(rulePrediction(row('squat', 'heel', { lean: 30, heel: 20 }, ['heel'])), 'heel');
    // 上身前傾 55°（門檻 50°，1.1 倍）、腳跟 21%（門檻 14%，1.5 倍）→ 腳跟離地
    assert.equal(rulePrediction(row('squat', 'heel', { lean: 55, heel: 21 }, ['lean', 'heel'])), 'heel');
    assert.equal(rulePrediction(row('squat', 'lean', { lean: 70, heel: 15 }, ['heel', 'lean'])), 'lean');
    // 數字看不到的排後面
    assert.equal(rulePrediction(row('squat', 'lean', { lean: null, heel: 15 }, ['lean', 'heel'])), 'heel');
    assert.equal(rulePrediction(row('squat', 'good', { lean: 30 }, ['constructor', 'knee'])), 'good');
});

test('DTW：門檻用訓練資料挑（猜對最多的、一樣多取低的），只分做對、做錯；沒有相似度的不比', () => {
    const train = [row('squat', 'good', { similarity: 95 }), row('squat', 'good', { similarity: 90 }), row('squat', 'lean', { similarity: 80 }), row('squat', 'heel', { similarity: 88 })];
    assert.equal(fitSimilarity(train), 90);
    assert.equal(fitSimilarity([row('squat', 'good', { similarity: 92 }), row('squat', 'lean', { similarity: 92 })]), 92);
    assert.equal(fitSimilarity([row('plank', 'good', { holdSway: 1 })]), null);
    assert.equal(similarityPrediction(row('squat', 'good', { similarity: 91 }), 90), 'good');
    assert.equal(similarityPrediction(row('squat', 'good', { similarity: 89 }), 90), 'wrong');
    assert.equal(similarityPrediction(row('plank', 'good', {}), 90), null);
    assert.equal(similarityPrediction(row('squat', 'good', { similarity: 91 }), null), null);
});

test('成績：猜對種類、做對做錯分對、做對的判成做對、做錯的抓到；DTW 沒有種類；加起來', () => {
    const rows = [row('squat', 'good', {}), row('squat', 'good', {}), row('squat', 'lean', {}), row('squat', 'heel', {}), row('squat', 'heel', {})];
    const s = score(rows, ['good', 'lean', 'lean', 'lean', null]);
    assert.deepEqual(s, { n: 4, kind: 2, binary: 3, good: { hit: 1, n: 2 }, wrong: { hit: 2, n: 2 },
        perClass: { good: { hit: 1, n: 2 }, lean: { hit: 1, n: 1 }, heel: { hit: 0, n: 1 } } });
    const d = score(rows, ['good', 'wrong', 'wrong', 'good', 'wrong'], { kinds: false });
    assert.equal(d.kind, null);
    assert.equal(d.binary, 3);
    assert.deepEqual([d.good, d.wrong], [{ hit: 1, n: 2 }, { hit: 2, n: 3 }]);
    assert.equal(ratio(38, 40), '38／40（95%）');
    assert.equal(ratio(null, 40), '—');
    assert.equal(ratio(0, 0), '—');
    assert.deepEqual(addScores([s, d]), { n: 9, kind: null, binary: 6, good: { hit: 2, n: 4 }, wrong: { hit: 4, n: 5 } });
    assert.deepEqual(addScores([s, s]), { n: 8, kind: 4, binary: 6, good: { hit: 2, n: 4 }, wrong: { hit: 4, n: 4 } });
});

test('模型學到的門檻：只把一種錯誤的數字慢慢加大，加到多少改猜成那種錯（落在做對和做錯之間）', () => {
    const rows = [];
    for (let i = 0; i < 20; i++) {
        const base = { min: 90, seconds: 2, similarity: 92, sway: 2, stalls: 0 };
        rows.push(row('squat', 'good', { ...base, lean: 25 + (i % 10), heel: i % 6 }));
        rows.push(row('squat', 'lean', { ...base, lean: 45 + (i % 15), heel: i % 6 }));
        rows.push(row('squat', 'heel', { ...base, lean: 25 + (i % 10), heel: 15 + (i % 10) }));
    }
    const model = trainModel('squat', rows, { trees: 40, seed: 1 });
    const lean = learnedLimit(model, rows, 'lean'), heel = learnedLimit(model, rows, 'heel');
    assert.ok(lean > 34 && lean <= 45, String(lean));
    assert.ok(heel > 5 && heel <= 15, String(heel));
    assert.equal(learnedLimit(model, rows, 'knee'), null);
    assert.equal(learnedLimit(model, [], 'lean'), null);
});

test('合成的三位受測者：用兩位訓練、拿第三位比；規則的成績和 ruleErrors 對得上；DTW 的門檻不看測試資料', async () => {
    const { rows } = await buildDataset(['A', 'B', 'C'].flatMap(s => syntheticSubject(s, ['squat', 'plank'])));
    const { train, test: held } = splitBySubject(rows, ['C']);
    const results = compareAll(train, held, { trees: 30 });
    assert.deepEqual(results.map(r => [r.workout, r.train, r.test]), [['squat', 40, 20], ['plank', 6, 3]]);
    const squat = results[0];
    assert.equal(squat.forest.n, 20);
    // 規則猜對種類：沒報錯又是做對的，加上報的錯（只有一種時）就是這組要做的
    const testSquat = held.filter(r => r.workout === 'squat');
    assert.equal(squat.rules.kind, testSquat.filter(r => (r.ruleErrors.length ? r.ruleErrors.includes(r.condition) : r.condition === 'good')).length);
    assert.equal(squat.dtw.kind, null);
    assert.equal(results[1].dtw.n, 0);
    // 測試資料的相似度改掉，DTW 的門檻不變（門檻只看訓練資料）
    const shifted = held.map(r => ({ ...r, features: { ...r.features, similarity: 10 } }));
    assert.equal(compareOne('squat', train, shifted, { trees: 5 }).threshold, squat.threshold);
    // 學到的門檻：深蹲兩種錯都有
    assert.deepEqual(squat.limits.map(l => l.id), ['lean', 'heel']);
    const lines = resultLines(results);
    assert.equal(lines[0], '深蹲（訓練 40 下、測試 20 下）');
    assert.match(lines[1], /^ {2}AI 模型：猜對種類 \d+／20/);
    assert.match(lines[2], /^ {2}AI 模型學到的門檻：上身前傾 .*（規則 50°）、腳跟離地 .*（規則 14%）；最常看：/);
    assert.ok(lines.includes('全部的動作'));
});

test('命令列：--synthetic 訓練、比較、存模型；訓練和測試混到（或測試是空的）就不訓練；沒給 --test 說用法', async () => {
    const run = promisify(execFile);
    const tool = fileURLToPath(new URL('../tools/train.mjs', import.meta.url));
    const dir = await mkdtemp(join(tmpdir(), 'train-'));
    try {
        const out = join(dir, 'models.json');
        const { stdout } = await run(process.execPath, [tool, '--synthetic', 'A,B', '--test', 'B', '--out', out], { maxBuffer: 1 << 24 });
        assert.match(stdout, /^訓練：A（63 列）；測試：B（63 列）\n其中 126 列是合成的/);
        assert.match(stdout, /\n全部的動作\n {2}AI 模型：猜對種類 \d+／63/);
        const file = JSON.parse(await readFile(out, 'utf8'));
        assert.equal(file.synthetic, true);
        assert.deepEqual(file.subjects, ['A']);
        assert.deepEqual(file.models.map(m => m.workout), ['squat', 'lunge', 'pushup', 'plank']);
        assert.ok(file.models.every(m => m.type === 'random-forest' && m.trees.length === 100));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
    await assert.rejects(run(process.execPath, [tool, '--synthetic', 'A', '--test', 'Z'], { maxBuffer: 1 << 24 }),
        e => e.code === 1 && /不訓練：測試資料是空的/.test(e.stdout));
    await assert.rejects(run(process.execPath, [tool, '--synthetic', 'A']), e => /用法/.test(e.stderr));
});
