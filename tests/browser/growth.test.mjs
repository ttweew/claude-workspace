// 成長曲線（11/1，瀏覽器端到端）：首頁「成長曲線」照日期畫運動紀錄，一天一個點
//   這台裝置的紀錄（事先放進 localStorage，用網站同一套 summarize 算的合成資料）：曲線、選動作和數字、表格
//   雲端同步打開：假的 Firebase（harness.mjs）回傳雲端上的紀錄，只在雲端的也畫進來、被改過的不算；讀不到時先畫這台裝置的
//   運動完多一個點；320 寬、axe-core
// 重播分析也顯示疲勞分析、動作流暢度、動作穩定度（11/1）：合成的錄製檔（js/data/synth.js），和 node 用同一套程式算的一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, serve, open, script, rep, workout } from './harness.mjs';
import { summarize, describe } from '../../js/analysis/session.js';
import { mergeRecords, growthSeries, growthLine, dayLabel, dayKey } from '../../js/analysis/growth.js';
import { cloudSession, fromCloud } from '../../js/cloud/sync.js';
import { makeDemoRecording } from '../../js/data/synth.js';
import { parseRecording, analyzeRecording } from '../../js/data/replay-core.js';
import { repSeries } from '../../js/analysis/rep-series.js';
import { fatigueOf, fatigueLine } from '../../js/analysis/fatigue.js';
import { fluencyOf, fluencyLine } from '../../js/analysis/fluency.js';
import { stabilityOf, stabilityLine } from '../../js/analysis/stability.js';

const require = createRequire(import.meta.url);
const at = (month, day, hour = 20) => new Date(2026, month - 1, day, hour).getTime();
function squat(date, mins) {
    const items = mins.map((min, i) => ({ n: i + 1, min, depth: min <= 90 ? 'good' : min <= 110 ? 'close' : 'shallow', start: i * 3, end: i * 3 + 2, errors: [], similarity: 90 }));
    return summarize('squat', items, date, date + 60000);
}
const plank = (date, seconds) => summarize('plank', seconds.map(s => ({ seconds: s, errors: [] })), date, date + 60000);
const LOCAL = [
    squat(at(10, 20), [85, 85, 100, 120]), squat(at(10, 20, 21), [85, 85, 85, 85, 85, 85]),
    plank(at(10, 21), [32.6, 20]), squat(at(10, 22), [85, 92, 85]), plank(at(10, 24), [40]), squat(at(10, 25), [85, 85, 85, 85, 85, 85, 85, 85])
];

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

// 打開首頁前放好：這台裝置的紀錄、雲端同步開著沒、假的雲端怎麼回答
async function home({ history = LOCAL, cloudOn = false, fakeCloud = null, size = {} } = {}) {
    const { context, page } = await open(browser, [], size);
    await context.addInitScript(([list, on, how]) => {
        try {
            localStorage.setItem('workoutHistory', JSON.stringify(list));
            if (on) localStorage.setItem('cloudSync', '1');
            localStorage.setItem('cloudAsked', '1');
        } catch (e) {}
        window.__fakeCloud = how;
    }, [history, cloudOn, fakeCloud]);
    await page.goto(site.base + 'index.html');
    return { context, page };
}
// 打開「成長曲線」，等雲端讀完（不是「正在讀」）
async function openGrowth(page) {
    await page.click('#growthBox > summary');
    await page.waitForFunction(() => !document.getElementById('growthChart').hidden && !document.getElementById('growthNote').textContent.startsWith('正在讀'), null, { timeout: 20000 });
}
const read = page => page.evaluate(() => ({
    label: document.querySelector('#growthChart svg').getAttribute('aria-label'),
    line: document.querySelector('#growthChart .growth-line-text').textContent,
    dots: document.querySelectorAll('#growthChart .growth-dot').length,
    rows: [...document.querySelectorAll('#growthChart tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)),
    note: document.getElementById('growthNote').textContent,
    metrics: [...document.querySelectorAll('#growthMetric option')].map(o => o.textContent),
    reads: (window.__cloudReads || []).length
}));

test('這台裝置的紀錄：一天一個點、選動作和數字、表格（新的在上面）', async () => {
    const { context, page } = await home();
    assert.equal(await page.isVisible('#growthBox'), true);
    assert.match(await page.textContent('#growthSub'), /^深蹲、棒式，6 次$/);
    await openGrowth(page);
    let r = await read(page);
    const expected = id => growthLine(growthSeries(LOCAL, ...id));
    assert.equal(r.label, expected(['squat', 'count']));
    assert.equal(r.line, r.label);
    assert.equal(r.dots, 3);
    assert.deepEqual(r.rows, [['10/25', '8 下', '1'], ['10/22', '3 下', '1'], ['10/20', '6 下', '2']]);
    assert.deepEqual(r.metrics, ['一次最多幾下', '到位比例', '沒有錯誤的比例', '和示範動作相似']);
    assert.match(r.note, /^只有這台裝置上的 6 次紀錄；打開「雲端同步」後/);
    await page.selectOption('#growthMetric', 'good');
    r = await read(page);
    assert.equal(r.label, expected(['squat', 'good']));
    assert.deepEqual(r.rows.map(x => x[1]), ['100%', '67%', '80%']);
    await page.selectOption('#growthWorkout', 'plank');
    r = await read(page);
    assert.deepEqual(r.metrics, ['最久撐幾秒', '一天總共撐幾秒', '沒有錯誤的比例']);
    assert.equal(r.label, expected(['plank', 'best']));
    assert.deepEqual(r.rows, [['10/24', '40 秒', '1'], ['10/21', '32 秒', '1']]);
    assert.equal(r.reads, 0, '雲端同步沒打開：不讀雲端');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('雲端同步打開：只在雲端的也畫進來（同一筆只算一次、被改過的不算），讀一次就記著', async () => {
    const local = LOCAL.slice(3);   // 這台裝置只剩 10/22 以後的（例如清除過紀錄）
    const up = s => ({ ...cloudSession(s), savedAt: { seconds: 1 } });
    const docs = [...LOCAL.map(up), { ...up(LOCAL[0]), count: -1, date: at(10, 1) }, { ...up(LOCAL[1]), workout: 'constructor', date: at(10, 2) }];
    const { context, page } = await home({ history: local, cloudOn: true, fakeCloud: { docs } });
    await openGrowth(page);
    const r = await read(page);
    const merged = mergeRecords(local, docs.map(fromCloud).filter(Boolean)).records;
    assert.equal(r.note, '這台裝置上的 3 次＋只在雲端的 3 次，共 6 次');
    assert.equal(r.label, growthLine(growthSeries(merged, 'squat', 'count')));
    assert.deepEqual(r.rows.map(x => x[0]), ['10/25', '10/22', '10/20'], '10/20 只在雲端；被改過的 10/1、10/2 不算');
    // 收起來再打開：不用再讀
    await page.click('#growthBox > summary');
    await page.click('#growthBox > summary');
    await page.waitForTimeout(500);
    assert.equal((await read(page)).reads, 1);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('雲端讀不到：先畫這台裝置的、寫出原因，下次打開再試', async () => {
    const { context, page } = await home({ cloudOn: true, fakeCloud: { error: 'unavailable' } });
    await openGrowth(page);
    let r = await read(page);
    assert.equal(r.note, '雲端暫時讀不到：先畫這台裝置上的 6 次紀錄，下次打開再試');
    assert.equal(r.label, growthLine(growthSeries(LOCAL, 'squat', 'count')));
    await page.click('#growthBox > summary');
    await page.evaluate(() => { window.__fakeCloud = { docs: [] }; });
    // 再打開：重新讀（打開的事件是非同步的，等到寫出讀到的結果）
    await page.click('#growthBox > summary');
    await page.waitForFunction(() => document.getElementById('growthNote').textContent.startsWith('這台裝置上的'), null, { timeout: 20000 });
    r = await read(page);
    assert.equal(r.note, '這台裝置上的 6 次（雲端上的都在這台裝置上）');
    assert.equal(r.reads >= 2, true, '再試了一次：' + r.reads);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('運動完：成長曲線多一個點（今天）', async () => {
    const frames = script([{ id: 'squat', depth: 0, frames: 60 }, ...[1, 2, 3, 4, 5].flatMap(() => rep('squat', { rest: 30 }))]);
    const { context, page } = await open(browser, frames);
    await context.addInitScript(list => { try { localStorage.setItem('workoutHistory', JSON.stringify(list)); localStorage.setItem('cloudAsked', '1'); } catch (e) {} }, LOCAL);
    await workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '5');
    await openGrowth(page);
    const r = await read(page);
    assert.deepEqual(r.rows[0], [dayLabel(dayKey(Date.now())), '5 下', '1']);
    assert.equal(r.dots, 4);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('320 寬的手機：不超出畫面；axe-core（成長曲線打開、表格打開）', async () => {
    const { context, page } = await home({ size: { width: 320, height: 640, mobile: true } });
    await openGrowth(page);
    await page.click('#growthChart details.rep-table summary');
    const width = await page.evaluate(() => [document.documentElement.scrollWidth, Math.round(document.getElementById('growthBox').getBoundingClientRect().right)]);
    assert.ok(Math.max(...width) <= 320, '320 寬不超出：' + width);
    const axe = readFileSync(process.env.AXE_CORE || require.resolve('axe-core/axe.min.js'), 'utf8');
    await page.addScriptTag({ content: axe });
    const v = await page.evaluate(async () => (await window.axe.run(document.getElementById('growthBox'))).violations.map(x => x.id + ':' + x.nodes.length));
    assert.deepEqual(v, []);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('重播分析：疲勞分析、動作流暢度、動作穩定度和 node 用同一套程式算的一樣', async () => {
    // 8 下深蹲，後 3 下比較淺（疲勞分析會寫變淺）
    const rec = makeDemoRecording({ depths: [85, 84, 86, 85, 85, 104, 106, 108], tempo: { down: 1, bottom: 0.3, up: 1, rest: 0.4 } });
    rec.meta.workout = 'squat';
    const text = JSON.stringify(rec);
    const result = await analyzeRecording(parseRecording(text), 640, 480, { workout: 'squat' });
    const series = repSeries('squat', result.reps);
    const expected = {
        summary: describe(summarize('squat', result.reps, 0, 0)).join('。'),
        fatigue: fatigueLine(fatigueOf(series)),
        fluency: fluencyLine(fluencyOf(series)),
        stability: stabilityLine(stabilityOf(series, 'squat'))
    };
    assert.match(expected.fatigue, /變淺/);
    const { context, page } = await open(browser, []);
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: 'synthetic_squat.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatSummary').textContent.startsWith('深蹲'), null, { timeout: 60000 });
    const got = await page.evaluate(() => ({
        summary: document.getElementById('squatSummary').textContent,
        fatigue: document.querySelector('#fatigueBox .fatigue-line').textContent,
        fluency: document.getElementById('fluencyBox').textContent,
        stability: document.getElementById('stabilityBox').textContent
    }));
    assert.deepEqual(got, expected);
    // 換成棒式：沒有疲勞分析、流暢度（收起來），也沒有程式錯誤
    await page.selectOption('#workoutPick', 'plank');
    await page.waitForFunction(() => document.getElementById('squatSummary').textContent.includes('棒式'), null, { timeout: 60000 });
    assert.deepEqual(await page.evaluate(() => [document.getElementById('fatigueBox').hidden, document.getElementById('fluencyBox').hidden]), [true, true]);
    assert.deepEqual(page.errors, []);
    await context.close();
});
