// 交叉驗證（11/3 保養）：每次留一位受測者當測試、其他人訓練（tools/train.mjs 的 crossValidate）
//   每一下剛好被猜過一次、每一次都沒混到、同樣的資料結果一樣、混到就停、受測者太少就停、命令列 --cv
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crossValidate, foldTotals, cvLines } from '../tools/train.mjs';
import { buildDataset } from '../tools/dataset.mjs';
import { datasetRows } from '../js/data/dataset.js';
import { testInfo } from '../js/data/test-mode.js';
import { syntheticSubject } from './synthetic-sets.mjs';

const OPTIONS = { trees: 30 };
let rows;
test.before(async () => {
    ({ rows } = await buildDataset(['A', 'B', 'C'].flatMap(s => syntheticSubject(s, ['squat', 'plank']))));
});

test('每一位輪流當測試：每一下剛好被猜過一次，訓練裡沒有測試的那位', () => {
    const folds = crossValidate(rows, OPTIONS);
    assert.deepEqual(folds.map(f => f.subject), ['A', 'B', 'C']);
    for (const f of folds) {
        assert.deepEqual(f.problems, []);
        for (const r of f.results) {
            const all = rows.filter(x => x.workout === r.workout);
            const mine = all.filter(x => x.subject === f.subject);
            assert.equal(r.test, mine.length, f.subject + ' ' + r.workout);
            assert.equal(r.train, all.length - mine.length);
        }
    }
    const totals = foldTotals(folds);
    assert.deepEqual(totals.map(t => [t.workout, t.test, t.forest.n, t.rules.n]), [['squat', 60, 60, 60], ['plank', 9, 9, 9]]);
    // 規則不用訓練：加起來就是每一下的規則判斷各算一次
    assert.equal(totals[0].rules.wrong.n, rows.filter(r => r.workout === 'squat' && r.condition !== 'good').length);
    // 學到的門檻：每一次的最低、最高
    const lean = totals[0].limits.find(l => l.id === 'lean');
    assert.ok(lean.low <= lean.high && lean.rule === 50);
});

test('同樣的資料、同樣的 seed，交叉驗證的結果一模一樣（換 seed 長出的森林不一樣）', () => {
    const strip = folds => JSON.stringify(foldTotals(folds));
    assert.equal(strip(crossValidate(rows, OPTIONS)), strip(crossValidate(rows, OPTIONS)));
    const a = crossValidate(rows, OPTIONS)[0].results[0].model, b = crossValidate(rows, { ...OPTIONS, seed: 2 })[0].results[0].model;
    assert.notEqual(JSON.stringify(a.trees), JSON.stringify(b.trees));
});

test('混到就停：同一個檔案被當成兩位受測者；受測者只有一位', () => {
    const one = (subject, file) => datasetRows(testInfo({ workout: 'squat', test: { subject, condition: 'good' } }), [{ features: { lean: 30 } }], { file })[0];
    assert.throws(() => crossValidate([one('A', 'same.json'), one('B', 'same.json')]), /A 當測試時混到了：同一個檔案兩邊都有：same\.json/);
    assert.throws(() => crossValidate([one('A', 'a.json')]), /受測者要 2 位以上/);
    // 測試的標記訓練沒有（只有一位做了棒式）：照樣算，問題寫在那一次
    const lone = datasetRows(testInfo({ workout: 'plank', test: { subject: 'B', condition: 'sag' } }), [{ features: { sag: 20 } }], { file: 'p.json' });
    const folds = crossValidate([one('A', 'a.json'), one('B', 'b.json'), ...lone], OPTIONS);
    assert.deepEqual(folds.map(f => f.problems), [[], ['測試資料有、訓練資料沒有的標記：棒式 故意塌腰']]);
});

test('給人看的幾行：每一位的正確率、每個動作、全部', () => {
    const lines = cvLines(crossValidate(rows, OPTIONS));
    assert.equal(lines[0], '交叉驗證：每次留一位受測者當測試、其他人訓練，共 3 次');
    assert.match(lines[1], /^每一位當測試時猜對種類（AI 模型／規則）：A \d+%／\d+%、B \d+%／\d+%、C \d+%／\d+%$/);
    assert.equal(lines[2], '深蹲（每一下都被猜過一次，共 60 下）');
    assert.match(lines[4], /^ {2}AI 模型學到的門檻（每一次）：上身前傾 [\d.～]+°（規則 50°）、腳跟離地 [\d.～]+%（規則 14%）$/);
    assert.ok(lines.includes('全部的動作'));
});

test('命令列 --cv：交叉驗證，--out 存的是全部受測者訓練的模型', async () => {
    const run = promisify(execFile);
    const tool = fileURLToPath(new URL('../tools/train.mjs', import.meta.url));
    const dir = await mkdtemp(join(tmpdir(), 'cv-'));
    try {
        const out = join(dir, 'models.json');
        const { stdout } = await run(process.execPath, [tool, '--synthetic', 'A,B', '--cv', '--out', out], { maxBuffer: 1 << 24 });
        assert.match(stdout, /^其中 126 列是合成的.*\n交叉驗證：每次留一位受測者當測試、其他人訓練，共 2 次\n/);
        assert.match(stdout, /模型（全部受測者訓練）存到 /);
        const file = JSON.parse(await readFile(out, 'utf8'));
        assert.deepEqual(file.subjects, ['A', 'B']);
        assert.equal(file.models.length, 4);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
    await assert.rejects(run(process.execPath, [tool, '--synthetic', 'A', '--cv'], { maxBuffer: 1 << 24 }),
        e => e.code === 1 && /不訓練：受測者要 2 位以上/.test(e.stdout));
});
