// AI 模型的資料檢查（11/2 保養）：訓練和測試資料照受測者分、檢查有沒有混到（tools/split.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitBySubject, checkSplit, splitLine } from '../tools/split.mjs';
import { buildDataset } from '../tools/dataset.mjs';
import { datasetRows } from '../js/data/dataset.js';
import { featureColumns } from '../js/analysis/features.js';
import { testInfo } from '../js/data/test-mode.js';
import { syntheticSubject } from './synthetic-sets.mjs';

// 一列（數字不重要）
const row = (subject, workout, condition, file = subject + '_' + workout + '_' + condition + '.json') =>
    datasetRows(testInfo({ workout, test: { subject, condition } }), [{}], { file })[0];

test('照受測者分：同一個人只在一邊，每一列都在、順序不變', () => {
    const rows = [row('A', 'squat', 'good'), row('B', 'squat', 'good'), row('A', 'squat', 'lean'), row('C', 'squat', 'good'), row('B', 'squat', 'lean')];
    const parts = splitBySubject(rows, ['B']);
    assert.deepEqual(parts.train.map(r => r.subject + r.condition), ['Agood', 'Alean', 'Cgood']);
    assert.deepEqual(parts.test.map(r => r.subject + r.condition), ['Bgood', 'Blean']);
    assert.equal(splitLine(parts), '訓練：A、C（3 列）；測試：B（2 列）');
    assert.deepEqual(checkSplit(parts.train, parts.test), []);
    // 好幾位當測試；不認得的代號什麼都不拿
    assert.equal(splitLine(splitBySubject(rows, ['A', 'C'])), '訓練：B（2 列）；測試：A、C（3 列）');
    assert.equal(splitLine(splitBySubject(rows, ['Z'])), '訓練：A、B、C（5 列）；測試：沒有（0 列）');
});

test('檢查：同一個受測者、同一個檔案兩邊都有，一邊是空的，測試的標記訓練沒有', () => {
    // 照列分、不照人分：A 兩邊都有（A 的上身前傾訓練也沒看過）
    assert.deepEqual(checkSplit([row('A', 'squat', 'good'), row('B', 'squat', 'lean')], [row('A', 'squat', 'lean')]), ['受測者兩邊都有：A']);
    assert.deepEqual(checkSplit([row('A', 'squat', 'good')], [row('A', 'squat', 'lean')]), ['受測者兩邊都有：A', '測試資料有、訓練資料沒有的標記：深蹲 故意上身前傾']);
    // 同一個檔案（被改了代號）
    assert.deepEqual(checkSplit([row('A', 'squat', 'good', 'x.json')], [row('B', 'squat', 'good', 'x.json')]), ['同一個檔案兩邊都有：x.json']);
    assert.deepEqual(checkSplit([], [row('B', 'squat', 'good')]), ['訓練資料是空的']);
    assert.deepEqual(checkSplit([row('A', 'squat', 'good')], []), ['測試資料是空的']);
    assert.deepEqual(checkSplit([row('A', 'squat', 'good')], [row('B', 'plank', 'sag'), row('B', 'plank', 'pike'), row('B', 'squat', 'good')]),
        ['測試資料有、訓練資料沒有的標記：棒式 故意塌腰、棒式 故意屁股太高']);
});

test('合成的三位受測者：每次留一位當測試（11/3 交叉驗證的分法）都沒有混到；特徵裡沒有答案', async () => {
    const { rows } = await buildDataset(['A', 'B', 'C'].flatMap(s => syntheticSubject(s, ['squat', 'plank'])));
    assert.equal(rows.length, 3 * 23);
    for (const s of ['A', 'B', 'C']) {
        const parts = splitBySubject(rows, [s]);
        assert.deepEqual(checkSplit(parts.train, parts.test), [], s);
        assert.equal(parts.test.length, 23);
        assert.ok(parts.test.every(r => r.subject === s) && parts.train.every(r => r.subject !== s));
    }
    // 照列隨便分（每 3 列一列當測試）：每個人兩邊都有、深蹲的 9 個檔案也是（棒式一個檔案只有一列），檢查抓得到
    const test3 = rows.filter((r, i) => i % 3 === 0), train3 = rows.filter((r, i) => i % 3 !== 0);
    assert.deepEqual(checkSplit(train3, test3), ['受測者兩邊都有：A、B、C',
        '同一個檔案兩邊都有：synthetic_A_squat_good_100.json、synthetic_A_squat_heel_102.json、synthetic_A_squat_lean_101.json 等 9 個']);
    // 特徵只有量到的數字：沒有第幾下、檔名、受測者、標記、規則的判斷（模型看不到答案）
    for (const r of rows) assert.deepEqual(Object.keys(r.features), featureColumns(r.workout).map(c => c.key));
});
