// AI 模型的資料（11/2，瀏覽器端到端）：實測報表選很多個合成的實測檔（不是真人）→「AI 模型的資料」寫幾列、每種標記幾下 →
// 下載的 CSV 和 node 用同一套程式算的一模一樣（網頁是在背景執行緒算的）；重錄的組不放進去；320 寬不左右超出、axe-core 0 個問題
// 只有一位受測者時提醒：訓練和測試要用不同的人（11/2 保養）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, serve, open, violations } from './harness.mjs';
import { syntheticSubject, syntheticSet } from '../synthetic-sets.mjs';
import { buildDataset } from '../../tools/dataset.mjs';
import { datasetCsv } from '../../js/data/dataset.js';

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

// 受測者 A 四個動作、B 的深蹲，加上 B 深蹲做對「重錄前」的那一次（比較早錄，不算），和一個不是實測檔的
const SETS = [...syntheticSubject('A'), ...syntheticSubject('B', ['squat']), syntheticSet('B', 'squat', 'good', 2)];
const plain = JSON.parse(SETS[0].text);
delete plain.meta.test;
const FILES = [...SETS, { name: 'pose_20261102_090000.json', text: JSON.stringify(plain) }];

test('實測報表：AI 模型的資料（摘要、下載的 CSV 和 node 算的一樣）', async () => {
    const { context, page } = await open(browser, [], { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'report.html');
    assert.equal(await page.isVisible('#aiDataCard'), false);
    await page.setInputFiles('#fileInput', FILES.map(f => ({ name: f.name, mimeType: 'application/json', buffer: Buffer.from(f.text) })));
    await page.waitForFunction(() => /^(已分析|沒有可以分析)/.test(document.getElementById('loadStatus').textContent), null, { timeout: 120000 });
    assert.equal(await page.textContent('#loadStatus'), '已分析 16 組，1 個檔案沒有讀到（見最下面）');

    // 摘要：A 63 列（三個計次的動作各 20 下、棒式 3 次）＋ B 深蹲 20 下；條件照代號排（和報表一樣）
    const lines = await page.$$eval('#aiDataSummary li', els => els.map(el => el.textContent));
    assert.deepEqual(lines, [
        '共 83 列（每一下一列，棒式每一次一列；受測者：A、B）',
        '深蹲：做對 20 下、故意腳跟離地 10 下、故意上身前傾 10 下',
        '弓箭步：做對 10 下、故意前膝超過腳尖 5 下、故意上身前傾 5 下',
        '伏地挺身：做對 10 下、故意屁股太高 5 下、故意塌腰 5 下',
        '棒式：做對 1 次、故意屁股太高 1 次、故意塌腰 1 次',
        '重錄的 1 組沒有放進來（以最後一次為準）',
        '其中 83 列是合成的實測檔（示範動畫的火柴人，不是真人）：只能拿來試流程，不能當成研究結果'
    ]);

    // 下載：和 node 用同一套程式（tools/dataset.mjs 的 buildDataset）算的一模一樣
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#aiDataBtn')]);
    assert.match(download.suggestedFilename(), /^ai_dataset_\d{8}_\d{4}\.csv$/);
    const csv = readFileSync(await download.path(), 'utf8');
    const expected = await buildDataset(FILES);
    assert.equal(expected.rows.length, 83);
    assert.equal(csv, datasetCsv(expected.rows));

    // 手機寬度不左右超出；載入後的整頁 axe-core 0 個問題
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('實測報表：只有一位受測者時提醒訓練和測試要用不同的人', async () => {
    const { context, page } = await open(browser, []);
    await page.goto(site.base + 'report.html');
    const files = syntheticSubject('C', ['squat']);
    await page.setInputFiles('#fileInput', files.map(f => ({ name: f.name, mimeType: 'application/json', buffer: Buffer.from(f.text) })));
    await page.waitForFunction(() => /^(已分析|沒有可以分析)/.test(document.getElementById('loadStatus').textContent), null, { timeout: 120000 });
    const lines = await page.$$eval('#aiDataSummary li', els => els.map(el => el.textContent));
    assert.deepEqual(lines.slice(0, 3), [
        '共 20 列（每一下一列，棒式每一次一列；受測者：C）',
        '只有 1 位受測者：AI 模型要拿一些人來學、另外的人來考（同一個人不能兩邊都有，不然等於先看過考題），至少要 2 位',
        '深蹲：做對 10 下、故意腳跟離地 5 下、故意上身前傾 5 下'
    ]);
    assert.deepEqual(page.errors, []);
    await context.close();
});
