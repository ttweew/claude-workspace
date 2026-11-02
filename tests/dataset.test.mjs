// AI 模型的資料（11/2）：實測檔 → 一下一列的資料表（js/data/dataset.js）、命令列工具（tools/dataset.mjs）
//   標記是這組要做的（實測模式記在檔案裡），規則的判斷另外一欄；CSV 的欄位、跳脫；摘要；
//   合成的實測檔整個流程：重錄的組不放、不是實測檔的說原因、順序和實測報表一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { datasetRows, datasetRow, datasetCsv, DATASET_HEAD, DATASET_FEATURES, datasetFileName, datasetSummary } from '../js/data/dataset.js';
import { testInfo } from '../js/data/test-mode.js';
import { buildDataset, summaryLines } from '../tools/dataset.mjs';
import { syntheticSubject, syntheticSet } from './synthetic-sets.mjs';

const info = (workout, condition, subject = 'B') => testInfo({ workout, test: { subject, condition } });

test('一組 → 每一下一列：標記是這組要做的，規則的判斷另外放', () => {
    const items = [
        { errors: ['heel'], min: 81.4, start: 2, end: 4.06, similarity: 92, sway: 1.2, stalls: 0, features: { lean: 30.2, heel: 21.5 } },
        { errors: [], min: 85, start: 6, end: 8, similarity: 90, sway: 0.8, stalls: 1, features: { lean: 29.9, heel: 12.1 } }
    ];
    const rows = datasetRows(info('squat', 'heel'), items, { file: 'test_B_squat_heel_20261020_210000.json' });
    assert.deepEqual(rows.map(r => [r.file, r.subject, r.workout, r.condition, r.conditionName, r.n, r.synthetic]), [
        ['test_B_squat_heel_20261020_210000.json', 'B', 'squat', 'heel', '故意腳跟離地', 1, false],
        ['test_B_squat_heel_20261020_210000.json', 'B', 'squat', 'heel', '故意腳跟離地', 2, false]
    ]);
    assert.deepEqual(rows[0].features, { min: 81, seconds: 2.1, similarity: 92, sway: 1.2, stalls: 0, lean: 30.2, heel: 21.5 });
    // 第二下規則沒報（腳跟 12.1% 沒超過 14%），標記還是「故意腳跟離地」：這是實測資料的限制，要抽查
    assert.deepEqual(rows.map(r => r.ruleErrors), [['heel'], []]);
    // 規則的判斷是另外一份：改資料表不會改到報表
    rows[0].ruleErrors.push('lean');
    assert.deepEqual(items[0].errors, ['heel']);
    // 被改壞的當成沒有
    assert.deepEqual(datasetRows(info('squat', 'good'), null), []);
    assert.deepEqual(datasetRows(info('squat', 'good'), [{ errors: 'lean' }])[0].ruleErrors, []);
});

test('CSV：欄名、每一列的格子、這個動作沒有的特徵留空、Excel 打得開又不會當成公式', () => {
    assert.deepEqual(DATASET_HEAD.slice(0, 6), ['檔名', '受測者', '動作', '標記', '標記代號', '第幾下']);
    assert.deepEqual(DATASET_HEAD.slice(-3), ['規則判斷', '規則判斷代號', '合成資料']);
    // 特徵照實測報表的動作順序（深蹲、弓箭步、伏地挺身、棒式），同一個欄位只出現一次
    assert.deepEqual(DATASET_FEATURES.map(f => f.key), ['min', 'seconds', 'similarity', 'sway', 'stalls', 'lean', 'heel', 'knee', 'sag', 'pike', 'holdSway']);
    assert.equal(DATASET_HEAD.length, 6 + DATASET_FEATURES.length + 3);

    const [squat] = datasetRows(info('squat', 'lean'), [{ errors: ['lean', 'heel'], min: 80, start: 1, end: 3, similarity: 88, sway: 2, stalls: 1,
        features: { lean: 55, heel: 16 } }], { file: '=HYPERLINK("x"),1.json', synthetic: true });
    const [plank] = datasetRows(info('plank', 'good'), [{ errors: [], seconds: 30.5, sway: 1.4, features: { sag: 3.2, pike: -3.1 } }], { file: 'p.json' });
    assert.deepEqual(datasetRow(squat), ['=HYPERLINK("x"),1.json', 'B', '深蹲', '故意上身前傾', 'lean', 1,
        80, 2, 88, 2, 1, 55, 16, null, null, null, null, '上身前傾、腳跟離地', 'lean heel', '是']);
    // 棒式：沒有角度、秒數、相似度；撐了幾秒不放（30.5 不會出現）
    assert.deepEqual(datasetRow(plank), ['p.json', 'B', '棒式', '做對', 'good', 1,
        null, null, null, null, null, null, null, null, 3.2, -3.1, 1.4, '沒有錯誤', 'good', '否']);

    const csv = datasetCsv([squat, plank]);
    assert.ok(csv.startsWith('\uFEFF檔名,受測者,動作,標記,'));
    const lines = csv.slice(1).split('\r\n');
    assert.equal(lines.length, 4);
    assert.equal(lines[0], DATASET_HEAD.join(','));
    // = 開頭的前面加 '，有逗號、引號的加引號
    assert.equal(lines[1], `"'=HYPERLINK(""x""),1.json",B,深蹲,故意上身前傾,lean,1,80,2,88,2,1,55,16,,,,,上身前傾、腳跟離地,lean heel,是`);
    assert.equal(lines[2], 'p.json,B,棒式,做對,good,1,,,,,,,,,3.2,-3.1,1.4,沒有錯誤,good,否');
    assert.equal(lines[3], '');
    assert.equal(datasetCsv([]), '\uFEFF' + DATASET_HEAD.join(',') + '\r\n');
    assert.equal(datasetFileName(new Date(2026, 10, 2, 9, 5)), 'ai_dataset_20261102_0905.csv');
});

test('摘要：幾列、受測者、每個動作每種標記幾下（照實測報表的順序）、合成的幾列', () => {
    const rows = [
        ...datasetRows(info('pushup', 'sag', 'A'), [{}, {}]),
        ...datasetRows(info('squat', 'lean', 'B'), [{}], { synthetic: true }),
        ...datasetRows(info('squat', 'good', 'A'), [{}, {}, {}]),
        ...datasetRows(info('plank', 'good', 'C'), [{}])
    ];
    assert.deepEqual(datasetSummary(rows), {
        rows: 7, subjects: ['A', 'B', 'C'], synthetic: 1,
        groups: [
            { workout: 'squat', condition: 'good', name: '做對', n: 3 },
            { workout: 'squat', condition: 'lean', name: '故意上身前傾', n: 1 },
            { workout: 'pushup', condition: 'sag', name: '故意塌腰', n: 2 },
            { workout: 'plank', condition: 'good', name: '做對', n: 1 }
        ]
    });
    assert.deepEqual(datasetSummary([]), { rows: 0, subjects: [], synthetic: 0, groups: [] });
});

test('合成的實測檔 → 資料表（和實測報表同一套）：重錄的組不放、不是實測檔的說原因', async () => {
    // 受測者 E 的深蹲、棒式，加上深蹲做對「重錄前」的那一次（seed 小，比較早錄）
    const sets = [...syntheticSubject('E', ['squat', 'plank']), syntheticSet('E', 'squat', 'good', 2)];
    const recording = JSON.parse(sets[0].text);
    delete recording.meta.test;
    const r = await buildDataset([...sets, { name: 'pose_20261020_211500.json', text: JSON.stringify(recording) }, { name: 'broken.json', text: '{"meta":' }]);
    assert.equal(r.redos, 1);
    assert.deepEqual(r.failed.map(f => f.name + '：' + f.why), ['pose_20261020_211500.json：不是實測模式錄的檔案', 'broken.json：檔案內容不完整或格式不正確']);
    // 深蹲 10＋5＋5 下、棒式 3 次；都是合成的、受測者 E
    assert.equal(r.rows.length, 23);
    assert.ok(r.rows.every(x => x.synthetic && x.subject === 'E'));
    assert.ok(!r.rows.some(x => x.file === 'synthetic_E_squat_good_2.json'));
    // 照實測報表的順序；每一下的標記就是檔案裡記的這一組要做的
    assert.deepEqual([...new Set(r.rows.map(x => x.workout + ' ' + x.condition))], ['squat good', 'squat heel', 'squat lean', 'plank good', 'plank pike', 'plank sag']);
    for (const x of r.rows) assert.match(x.file, new RegExp('^synthetic_E_' + x.workout + '_' + x.condition + '_\\d+\\.json$'));
    assert.deepEqual(r.rows.filter(x => x.workout === 'squat' && x.condition === 'good').map(x => x.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // 每一下都有特徵（合成的人一直看得到）
    for (const x of r.rows) {
        const keys = x.workout === 'plank' ? ['sag', 'pike'] : ['min', 'seconds', 'similarity', 'sway', 'stalls', 'lean', 'heel'];
        for (const k of keys) assert.equal(typeof x.features[k], 'number', x.file + ' ' + k);
    }
    const lines = summaryLines(r);
    assert.equal(lines[0], 'AI 模型的資料：23 列（受測者：E）');
    assert.ok(lines.includes('  深蹲 做對：10 下') && lines.includes('  棒式 故意塌腰：1 次'), lines.join('\n'));
    assert.ok(lines.includes('重錄的 1 組沒有放進來（以最後一次為準）'));
    assert.ok(lines.includes('沒有讀到 broken.json：檔案內容不完整或格式不正確'));
});

test('命令列工具：--synthetic 寫出 CSV，摘要印在錯誤輸出；--test 照受測者分、檢查有沒有混到；沒給檔案時說用法', async () => {
    const run = promisify(execFile);
    const tool = fileURLToPath(new URL('../tools/dataset.mjs', import.meta.url));
    const { stdout, stderr } = await run(process.execPath, [tool, '--synthetic', 'F,G', '--test', 'G'], { maxBuffer: 1 << 24 });
    const lines = stdout.split('\r\n');
    assert.equal(lines[0], '\uFEFF' + DATASET_HEAD.join(','));
    // 一位受測者：深蹲、弓箭步、伏地挺身各 20 下，棒式 3 次；最後一行是空的
    assert.equal(lines.length, 1 + 2 * 63 + 1);
    assert.match(stderr, /^AI 模型的資料：126 列（受測者：F、G）/);
    assert.match(stderr, /其中 126 列是合成的/);
    // 11/2 保養：訓練和測試照受測者分
    assert.match(stderr, /\n訓練：F（63 列）；測試：G（63 列）\n檢查：沒有混到（每位受測者只在一邊）\n$/);
    // 只有一位、拿他當測試：訓練資料是空的，結束代碼 1
    await assert.rejects(run(process.execPath, [tool, '--synthetic', 'F', '--test', 'F'], { maxBuffer: 1 << 24 }),
        e => e.code === 1 && /檢查：訓練資料是空的/.test(e.stderr));
    await assert.rejects(run(process.execPath, [tool]), e => /用法/.test(e.stderr));
});
