// AI 判斷放進網站之後（11/4 保養，瀏覽器端到端）：換一條路走，AI 判斷都一樣
//   背景執行緒開不起來（改在主畫面算）：重播分析、實測報表的 AI 判斷和 node 算的一樣
//   斷網：有網路時打開過重播分析，斷網後重新整理、讀檔，AI 判斷照常（模型檔 ai-model.js 存在手機裡，sw.js）
//   發布出去的網站：照 .github/workflows/deploy.yml 在每個檔案的網址加版本號，模型檔也加到，AI 判斷照常
//   最小的手機（320 寬）：表格多了一欄，整頁不會左右捲動；無障礙
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, serve, open, violations, ROOT } from './harness.mjs';
import { syntheticSet, syntheticSubject } from '../synthetic-sets.mjs';
import { analyzeOne } from '../../js/data/report-core.js';
import { aiJudge, aiJudgeFeatures, judgeText } from '../../js/analysis/ai-judge.js';
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

// 合成受測者 K（訓練時沒看過）故意腳跟離地的那組
const SET = syntheticSet('K', 'squat', 'heel', 1);
// node 算的：每一下 AI 判斷那一格的字
async function expectedCells(set) {
    const r = await analyzeOne(set.text);
    return r.items.map(it => {
        const j = aiJudge(r.info.workout, it);
        return judgeText(j.label) + '（' + Math.round(j.confidence * 100) + '%）';
    });
}

async function replay(page, base, set = SET) {
    await page.goto(base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: set.name, mimeType: 'application/json', buffer: Buffer.from(set.text) });
    await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
    return {
        cells: await page.$$eval('#squatTable tbody tr', trs => trs.map(tr => tr.lastElementChild.textContent)),
        line: await page.textContent('#aiBox')
    };
}

test('背景執行緒開不起來（改在主畫面算）：重播分析、實測報表的 AI 判斷都和 node 算的一樣', async () => {
    const { context, page } = await open(browser, []);
    const expected = await expectedCells(SET);
    const normal = await replay(page, site.base);
    assert.deepEqual(normal.cells, expected);
    // 擋掉背景執行緒的檔案：網站改在主畫面讀檔、算
    await context.route('**/js/data/replay-worker.js*', route => route.abort());
    await context.route('**/js/data/report-worker.js*', route => route.abort());
    const main = await replay(page, site.base);
    assert.deepEqual(main, normal);
    // 實測報表：K 的 9 組（63 列）
    const sets = syntheticSubject('K');
    await page.goto(site.base + 'report.html');
    await page.setInputFiles('#fileInput', sets.map(f => ({ name: f.name, mimeType: 'application/json', buffer: Buffer.from(f.text) })));
    await page.waitForFunction(() => /^(已分析|沒有可以分析)/.test(document.getElementById('loadStatus').textContent), null, { timeout: 120000 });
    const { rows } = await buildDataset(sets);
    const ai = rows.filter(r => aiJudgeFeatures(r.workout, r.features).label === r.condition).length;
    const lines = await page.$$eval('#aiDataSummary li', els => els.map(el => el.textContent));
    assert.ok(lines.some(l => l.startsWith('AI 模型（示範：用合成資料訓練的）猜對 ' + ratioText(ai, 63) + ' 列')), lines.join('\n'));
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('斷網：有網路時打開過重播分析，斷網後重新整理、讀檔，AI 判斷照常（模型檔存在手機裡）', async () => {
    const { context, page } = await open(browser, []);
    const expected = await expectedCells(SET);
    // 第 1 次：註冊 Service Worker（網頁載入完才註冊）；等它接手這一頁
    await page.goto(site.base + 'replay.html');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
    // 第 2 次：網頁、程式、背景執行緒、模型檔都經過 Service Worker，存起來
    assert.deepEqual((await replay(page, site.base)).cells, expected);
    const stored = await page.evaluate(() => caches.open('site-files-v1').then(c => c.keys()).then(k => k.map(r => new URL(r.url).pathname)));
    for (const f of ['/replay.html', '/js/pages/replay.js', '/js/analysis/ai-judge.js', '/js/analysis/ai-model.js', '/js/analysis/forest.js', '/js/data/replay-worker.js']) {
        assert.ok(stored.includes(f), '存起來的檔案有 ' + f + '：' + stored.join(' '));
    }
    await context.setOffline(true);
    const offline = await replay(page, site.base);
    assert.deepEqual(offline.cells, expected);
    assert.match(offline.line, /^AI 判斷（示範：模型是用合成資料訓練的，不是真人）：/);
    await context.setOffline(false);
    assert.deepEqual(page.errors, []);
    await context.close();
});

// .github/workflows/deploy.yml「Add version to file links」那一步的指令（每個檔案的網址加版本號），在網站的複本上跑
async function deployCopy() {
    const yml = await readFile(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const step = yml.split('- name: Add version to file links')[1];
    assert.ok(step, 'deploy.yml 有加版本號的那一步');
    const lines = step.split('\n');
    const start = lines.findIndex(l => /^\s+run: \|\s*$/.test(l));
    const indent = lines[start + 1].match(/^\s*/)[0];
    const run = [];
    for (const l of lines.slice(start + 1)) {
        if (l.trim() && !l.startsWith(indent)) break;
        run.push(l.slice(indent.length));
    }
    const dir = await mkdtemp(join(tmpdir(), 'deploy-'));
    await cp(ROOT, dir, { recursive: true, filter: src => !/[\\/](\.git|node_modules)$/.test(src) });
    // 版本號：commit 編號的前 8 碼（這裡用固定的假編號）
    await promisify(execFile)('bash', ['-e', '-c', run.join('\n')], { cwd: dir, env: { ...process.env, GITHUB_SHA: 'abcdef1234567890' }, maxBuffer: 1 << 24 });
    return dir;
}

test('發布出去的網站（每個檔案的網址加版本號）：模型檔也加到，AI 判斷照常', async () => {
    const dir = await deployCopy();
    const stamped = await serve(dir);
    try {
        assert.match(await readFile(join(dir, 'js/analysis/ai-judge.js'), 'utf8'), /from '\.\/ai-model\.js\?v=abcdef12'/);
        const { context, page } = await open(browser, []);
        const asked = [];
        context.on('request', req => { if (req.url().startsWith(stamped.base) && /\.js(\?|$)/.test(req.url())) asked.push(req.url().slice(stamped.base.length)); });
        const r = await replay(page, stamped.base);
        assert.deepEqual(r.cells, await expectedCells(SET));
        // 網頁和背景執行緒要的每個程式檔都帶版本號（拿到的都是同一版）；
        // sw.js 本來就不加（Service Worker 的網址要固定，瀏覽器才認得是同一個、比對內容有沒有更新）
        for (const f of ['js/analysis/ai-model.js', 'js/analysis/ai-judge.js', 'js/data/replay-worker.js']) assert.ok(asked.includes(f + '?v=abcdef12'), f + '：' + asked.join(' '));
        assert.deepEqual(asked.filter(u => !u.endsWith('?v=abcdef12') && u !== 'sw.js'), []);
        assert.deepEqual(page.errors, []);
        await context.close();
    } finally {
        await stamped.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test('最小的手機（320 寬）：表格多了 AI 判斷一欄，整頁不會左右捲動；無障礙', async () => {
    const { context, page } = await open(browser, [], { width: 320, height: 640, mobile: true });
    await replay(page, site.base);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#squatCard'), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});
