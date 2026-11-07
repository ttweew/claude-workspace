// AI 自動辨識動作（11/8，瀏覽器端到端）：首頁自由模式 AI 猜你在做哪個動作、一鍵切換過去；
// 重播分析寫 AI 猜這段錄影在做什麼（各幾秒，和 node 用同一套程式算的一樣）、一鍵改用 AI 猜的動作分析
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, violations } from './harness.mjs';
import { syntheticSet } from '../synthetic-sets.mjs';
import { parseRecording, analyzeRecording } from '../../js/data/replay-core.js';
import { ACTIVITY_NAMES } from '../../js/analysis/activity.js';
import { WORKOUTS } from '../../js/analysis/workouts.js';

const stand = (id, frames) => ({ id, depth: 0, frames });
// 站 4 秒，再深蹲 8 下（每下約 2.7 秒）：AI 先猜站著、開始蹲之後猜深蹲；切換過去之後還有幾下可以數
const SQUAT = script([stand('squat', 120), ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap(() => rep('squat', { hold: 10, rest: 20 })), stand('squat', 60)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

test('首頁自由模式：站著時寫站著、開始深蹲後寫「你在做深蹲」，按「切換到深蹲」就開始數；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'index.html?workout=free');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    const card = () => page.evaluate(() => ({
        hidden: document.getElementById('activity').hidden,
        text: document.getElementById('activityText').textContent,
        sure: document.getElementById('activitySure').textContent,
        button: document.getElementById('activitySwitch').hidden ? null : document.getElementById('activitySwitch').textContent
    }));
    await page.waitForFunction(() => /^你現在站著/.test(document.getElementById('activityText').textContent), null, { timeout: 20000 });
    const standing = await card();
    assert.equal(standing.hidden, false);
    assert.equal(standing.button, null, '站著：沒有切換的按鈕');
    await page.waitForFunction(() => document.getElementById('activityText').textContent === '你在做深蹲', null, { timeout: 30000 });
    const squat = await card();
    assert.equal(squat.button, '切換到深蹲');
    assert.match(squat.sure, /^（把握 \d+%）$/);
    // 最小的手機：卡片在畫面裡、整頁不左右捲動；axe-core
    const box = await page.$eval('#activity .activity-card', el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(box.left >= 0 && box.right <= 320, '卡片在畫面裡：' + JSON.stringify(box));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#activity'), []);
    // 一鍵切換：和選深蹲一樣（開始數、記住選的動作），卡片收起來
    await page.click('#activitySwitch');
    await page.waitForFunction(() => !document.getElementById('hudRepsBox').hidden, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    assert.equal((await card()).hidden, true);
    await page.waitForFunction(() => Number(document.getElementById('hudReps').textContent) >= 2, null, { timeout: 30000 });
    assert.equal((await card()).hidden, true, '選了動作就不猜');
    assert.deepEqual(page.errors, []);
    await context.close();
});

// 錄製時選了「自由」的檔案（合成受測者 K 的弓箭步，訓練時沒看過）
function freeRecording(set) {
    const rec = JSON.parse(set.text);
    rec.meta.workout = 'free';
    delete rec.meta.test;
    return JSON.stringify(rec);
}
// node 用同一套程式算的那一句（重播分析的寫法）；id：現在分析的動作（沒有時 null）
async function expectedLine(text, id) {
    const parsed = parseRecording(text);
    const out = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: null });
    const sum = out.activity;
    // 不到 1 秒的不寫
    return 'AI 自動辨識動作（示範：模型是用合成資料訓練的，不是真人）：' + sum.list.filter(x => x.seconds >= 1).map(x => ACTIVITY_NAMES[x.label] + ' ' + Math.floor(x.seconds) + ' 秒').join('、')
        + '；大部分在做' + ACTIVITY_NAMES[sum.top] + (id ? (sum.top === id ? '，和現在分析的動作一樣' : '，和現在分析的「' + WORKOUTS[id].name + '」不一樣') : '') + '。';
}

test('重播分析：錄製時沒選動作的檔案寫 AI 猜的（和 node 算的一樣），按「用弓箭步分析」就用弓箭步算；背景執行緒開不起來也一樣', async () => {
    const text = freeRecording(syntheticSet('K', 'lunge', 'good', 7));
    for (const blocked of [false, true]) {
        const { context, page } = await open(browser, [], { width: 390, height: 844, mobile: true });
        if (blocked) await context.route('**/js/data/replay-worker.js*', r => r.abort());
        await page.goto(site.base + 'replay.html');
        await page.setInputFiles('#fileInput', { name: 'free_lunge.json', mimeType: 'application/json', buffer: Buffer.from(text) });
        await page.waitForFunction(() => !document.getElementById('squatCard').hidden && !document.getElementById('activityRow').hidden, null, { timeout: 60000 });
        assert.equal(await page.textContent('#activityBox'), await expectedLine(text, null));
        assert.equal(await page.textContent('#activityUse'), '用弓箭步分析');
        assert.match(await page.textContent('#squatSummary'), /^這個檔案錄製時沒有選動作/);
        await page.click('#activityUse');
        await page.waitForFunction(() => document.getElementById('squatSummary').textContent.startsWith('弓箭步'), null, { timeout: 60000 });
        assert.equal(await page.inputValue('#workoutPick'), 'lunge');
        assert.equal(await page.textContent('#activityBox'), await expectedLine(text, 'lunge'));
        assert.equal(await page.evaluate(() => document.getElementById('activityUse').hidden), true, '和分析的動作一樣：沒有按鈕');
        // 選了別的動作：寫不一樣，按鈕再出現
        await page.selectOption('#workoutPick', 'squat');
        await page.waitForFunction(() => document.getElementById('squatSummary').textContent.startsWith('深蹲') || document.getElementById('squatSummary').textContent.startsWith('沒有偵測到完整的深蹲'), null, { timeout: 60000 });
        assert.equal(await page.textContent('#activityBox'), await expectedLine(text, 'squat'));
        assert.equal(await page.textContent('#activityUse'), '用弓箭步分析');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        assert.deepEqual(await violations(page, '#squatCard'), []);
        assert.deepEqual(page.errors, []);
        await context.close();
    }
});
