// AI 判斷（11/4，瀏覽器端到端）：重播分析每一下多一欄「AI 判斷（把握）」、上面一句和規則一樣幾下；
// 實測報表寫 AI 模型和規則各猜對幾列。期望的數字在 node 用同一套程式算（analyzeOne → aiJudge、ruleJudge），和網頁算的一樣
// 用訓練時沒看過的合成受測者 K；訓練時看過的（A）寫出「不能算數」
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, violations } from './harness.mjs';
import { syntheticSet, syntheticSubject } from '../synthetic-sets.mjs';
import { analyzeOne } from '../../js/data/report-core.js';
import { aiJudge, aiJudgeFeatures, ruleJudge, judgeText } from '../../js/analysis/ai-judge.js';
import { itemFeatures } from '../../js/analysis/features.js';
import { buildDataset } from '../../tools/dataset.mjs';
import { ratioText } from '../../js/data/test-report.js';

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

async function replay(page, set) {
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: set.name, mimeType: 'application/json', buffer: Buffer.from(set.text) });
    await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
}

test('重播分析：每一下的 AI 判斷和 node 算的一樣、和規則不一樣的標出來、實測檔寫各猜對幾下；手機寬度、無障礙', async () => {
    const { context, page } = await open(browser, [], { width: 390, height: 844, mobile: true });
    const set = syntheticSet('K', 'squat', 'heel', 1);
    await replay(page, set);
    const expected = await analyzeOne(set.text);
    const judged = expected.items.map(it => ({ ai: aiJudge('squat', it), rule: ruleJudge('squat', it.errors, itemFeatures('squat', it)) }));
    assert.equal(judged.length, 5);
    const head = await page.$$eval('#squatTable thead th', ths => ths.map(th => th.textContent));
    assert.equal(head[head.length - 1], 'AI 判斷（把握）');
    assert.equal(head[head.length - 2], '錯誤');
    const cells = await page.$$eval('#squatTable tbody tr', trs => trs.map(tr => ({ text: tr.lastElementChild.textContent, differ: tr.lastElementChild.classList.contains('ai-differ') })));
    assert.deepEqual(cells, judged.map(j => ({ text: judgeText(j.ai.label) + '（' + Math.round(j.ai.confidence * 100) + '%）', differ: j.ai.label !== j.rule })));
    const differ = judged.map((j, i) => (j.ai.label !== j.rule ? i + 1 : null)).filter(n => n !== null);
    const hit = pick => judged.filter(j => pick(j) === 'heel').length;
    // AI 判成哪幾種各幾下（11/7 加的，照模型的標記順序：做對、上身前傾、腳跟離地；0 下的不寫）
    const counts = ['good', 'lean', 'heel'].map(l => [l, judged.filter(j => j.ai.label === l).length]).filter(([, n]) => n > 0)
        .map(([l, n]) => judgeText(l) + ' ' + n + ' 下').join('、');
    assert.equal(await page.textContent('#aiBox'), 'AI 判斷（示範：模型是用合成資料訓練的，不是真人）：' + counts + '；和規則一樣 ' + (5 - differ.length) + ' 下'
        + (differ.length ? '、不一樣 ' + differ.length + ' 下（第 ' + differ.join('、') + ' 下）' : '')
        + '。這組要做的是「故意腳跟離地」：AI 猜對 ' + hit(j => j.ai.label) + '／5 下、規則 ' + hit(j => j.rule) + '／5 下。');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#squatCard'), []);
    // 訓練時看過的受測者（A）：猜對的不能算數；棒式（一次一列）也有 AI 判斷
    await replay(page, syntheticSet('A', 'plank', 'sag', 1));
    assert.match(await page.textContent('#aiBox'), /^AI 判斷（示範：模型是用合成資料訓練的，不是真人）：(做對|塌腰|屁股太高) 1 次；和規則一樣 \d 次.*這組要做的是「故意塌腰」：AI 猜對 \d／1 次、規則 \d／1 次（受測者 A 的資料訓練時看過，AI 猜對的不能算數）。$/);
    assert.equal((await page.$$eval('#squatTable thead th', ths => ths.map(th => th.textContent))).pop(), 'AI 判斷（把握）');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('實測報表：訓練時沒看過的受測者，AI 模型和規則各猜對幾列（和 node 算的一樣）', async () => {
    const { context, page } = await open(browser, []);
    const sets = syntheticSubject('K');
    await page.goto(site.base + 'report.html');
    await page.setInputFiles('#fileInput', sets.map(f => ({ name: f.name, mimeType: 'application/json', buffer: Buffer.from(f.text) })));
    await page.waitForFunction(() => /^(已分析|沒有可以分析)/.test(document.getElementById('loadStatus').textContent), null, { timeout: 120000 });
    const { rows } = await buildDataset(sets);
    const ai = rows.filter(r => aiJudgeFeatures(r.workout, r.features).label === r.condition).length;
    const rule = rows.filter(r => ruleJudge(r.workout, r.ruleErrors, r.features) === r.condition).length;
    const lines = await page.$$eval('#aiDataSummary li', els => els.map(el => el.textContent));
    assert.ok(lines.includes('AI 模型（示範：用合成資料訓練的）猜對 ' + ratioText(ai, 63) + ' 列，規則 ' + ratioText(rule, 63) + ' 列（猜每一下是做對，還是哪一種錯）'), lines.join('\n'));
    assert.ok(!lines.some(l => l.includes('訓練 AI 模型時看過')));
    assert.deepEqual(page.errors, []);
    await context.close();
});
