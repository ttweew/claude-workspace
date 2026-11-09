// AI 全自動（11/9，瀏覽器端到端，假的 AI）：不用選動作，AI 認出你在做什麼就自動換過去開始計次（js/analysis/auto-mode.js）
//   首頁打開「AI 全自動」、自由模式開鏡頭：站著時寫站著，開始深蹲後自己換成深蹲、講「開始數深蹲」，AI 認出來之前做的也算（8 下都數到）
//   錄製中不換（卡片寫原因），停止錄製後才換過去；開關會記住
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, summary, violations } from './harness.mjs';

const stand = (id, frames) => ({ id, depth: 0, frames });
// 站 4 秒，再深蹲 8 下（每下約 2.7 秒）：AI 大約做到第 2 下才認出深蹲
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

const card = page => page.evaluate(() => ({
    hidden: document.getElementById('activity').hidden,
    title: document.getElementById('activityTitle').textContent,
    text: document.getElementById('activityText').textContent,
    button: document.getElementById('activitySwitch').hidden ? null : document.getElementById('activitySwitch').textContent
}));

async function ready(page) {
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
}

test('打開「AI 全自動」、自由模式開鏡頭：認出深蹲就自己開始數，認出來之前做的也算（8 下都數到）；講「開始數深蹲」；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    assert.equal(await page.isChecked('#aiAutoToggle'), false, '預設關');
    await page.click('#aiAutoToggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('aiAuto')), '1');
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => /^你現在站著/.test(document.getElementById('activityText').textContent), null, { timeout: 20000 });
    const standing = await card(page);
    assert.deepEqual(standing, { hidden: false, title: 'AI 全自動', text: '你現在站著；開始做動作，AI 認出來就自動開始數', button: null });
    // 開始深蹲：自己換成深蹲（和選深蹲一樣：開始數、記住選的動作）
    await page.waitForFunction(() => !document.getElementById('hudRepsBox').hidden, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    const started = await card(page);
    assert.equal(started.title, 'AI 全自動');
    assert.match(started.text, /^開始數深蹲(（AI 認出來之前做的 \d 下也算進去）)?$/);
    assert.equal(started.button, null, 'AI 全自動時沒有「切換到…」的按鈕');
    assert.ok(await page.evaluate(() => window.__said.includes('開始數深蹲')), '講「開始數深蹲」');
    // 最小的手機：卡片在畫面裡、整頁不左右捲動；axe-core
    const box = await page.$eval('#activity .activity-card', el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(box.left >= 0 && box.right <= 320, '卡片在畫面裡：' + JSON.stringify(box));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#activity'), []);
    // 數的時候卡片寫現在數什麼
    await page.waitForFunction(() => /^現在數深蹲；換別的動作，AI 會跟著換$/.test(document.getElementById('activityText').textContent), null, { timeout: 10000 });
    // 8 下都數到（AI 認出來之前做的那下是重算出來的）
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '8', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    assert.match((await summary(page)).lines[0], /^深蹲 8 下/);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('錄製中不自動換（卡片寫原因），停止錄製後才換過去、前面最多 8 秒照樣重算；開關會記住', async () => {
    const { context, page } = await open(browser, SQUAT);
    await context.addInitScript(() => { try { localStorage.setItem('aiAuto', '1'); } catch (e) {} });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    assert.equal(await page.isChecked('#aiAutoToggle'), true, '記住打開');
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    await page.click('#dataBtn');
    await page.waitForFunction(() => document.getElementById('activityText').textContent === '錄製中不自動開始數（先停止錄製）', null, { timeout: 20000 });
    // 開始蹲了好幾下還是不換（錄製檔只記一個動作）
    await page.waitForTimeout(9000);
    assert.equal(await page.evaluate(() => document.getElementById('hudRepsBox').hidden), true);
    // 網址選的自由模式不會存起來（null）；沒有換成深蹲
    assert.notEqual(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    // 停止錄製：馬上換過去開始數
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    await page.click('#dataBtn');
    await page.waitForFunction(() => !document.getElementById('hudRepsBox').hidden, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    assert.match(await page.textContent('#activityText'), /^開始數深蹲/);
    // 關掉：和以前一樣（自由模式只猜、按了才換）
    await page.click('#stopBtn');
    await page.waitForFunction(() => document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.click('#aiAutoToggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('aiAuto')), '0');
    assert.deepEqual(page.errors, []);
    await context.close();
});

// AI 全自動的總結（11/8 追加）：換了動作，前一個存成一次運動、總結只剩最後一個；
// 結束時「這次運動」最上面一句列出這次做了哪些動作、各幾下
const MIXED = script([stand('squat', 120), ...[1, 2, 3, 4].flatMap(() => rep('squat', { hold: 10, rest: 20 })), stand('squat', 60),
    ...[1, 2, 3, 4, 5, 6].flatMap(() => rep('pushup', { hold: 10, rest: 20 })), { id: 'pushup', depth: 0, frames: 30 }]);

test('AI 全自動換了動作（深蹲 → 伏地挺身）：換過去時講上一個動作的結果；結束時總結最上面列出這次做的每個動作；只做一個動作時不寫', async () => {
    const { context, page } = await open(browser, MIXED);
    await context.addInitScript(() => { try { localStorage.setItem('aiAuto', '1'); } catch (e) {} });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('hudRepsName').textContent === '伏地挺身', null, { timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '6', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    const read = await page.evaluate(() => ({
        auto: document.getElementById('autoSummaryBox').hidden ? null : document.getElementById('autoSummaryBox').textContent,
        history: JSON.parse(localStorage.getItem('workoutHistory')).map(r => [r.workout, r.count])
    }));
    assert.equal(read.auto, '這次做了 2 個動作（AI 全自動）：深蹲 4 下 → 伏地挺身 6 下（每個動作各存成一次運動，下面是最後一個）');
    assert.deepEqual(read.history, [['squat', 4], ['pushup', 6]]);
    // 換過去時先講上一個動作的結果（11/8 追加 2），再講開始數；從自由模式換過來的只講開始數
    const said = await page.evaluate(() => window.__said);
    assert.ok(said.includes('開始數深蹲'), said.join('／'));
    assert.ok(said.some(t => /^深蹲做完 4 下，AI 評分平均 \d+ 分；開始數伏地挺身$/.test(t)), said.join('／'));
    assert.match((await summary(page)).lines[0], /^伏地挺身 6 下/);
    assert.deepEqual(await violations(page, '#summary'), []);
    // 重新打開網頁（假的 AI 從頭播）、只做深蹲就結束：只有一個動作，不寫
    await page.reload();
    await ready(page);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('hudRepsBox').hidden && Number(document.getElementById('hudReps').textContent) >= 2, null, { timeout: 60000 });
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('autoSummaryBox').hidden), true);
    assert.deepEqual(page.errors, []);
    await context.close();
});

// AI 全自動＋AI 教練（11/9 保養，js/ui/coach-view.js 的 quiet）：換動作時（還在運動）教練建議只寫、不唸、不問 Gemini
// 以前每換一次就問一次 Gemini，回答時把正在講的「深蹲做完 4 下…開始數伏地挺身」切斷，在做伏地挺身時唸建議
test('AI 全自動換動作時，AI 教練不唸、不問 Gemini；按「結束」時才問一次、唸一次（11/9 保養）', async () => {
    const { context, page } = await open(browser, MIXED);
    await context.addInitScript(() => {
        try { localStorage.setItem('aiAuto', '1'); localStorage.setItem('aiCoach', '1'); } catch (e) {}
        window.__fakeAI = { reply: '每一下都蹲到位，節奏很穩，下次可以試著多做兩下。' };
    });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('hudRepsName').textContent === '伏地挺身', null, { timeout: 60000 });
    // 換過去了：還沒問 Gemini、沒有唸教練建議
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => (window.__aiPrompts || []).length), 0);
    assert.equal((await page.evaluate(() => window.__said)).filter(t => t.startsWith('教練建議')).length, 0);
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '6', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('coachSource').textContent === '（AI 教練，Gemini）', null, { timeout: 15000 });
    // 結束時：問一次 Gemini（最後的伏地挺身）、唸一次，在換動作那一句後面
    assert.equal(await page.evaluate(() => window.__aiPrompts.length), 1);
    const said = await page.evaluate(() => window.__said);
    const coachAt = said.map((t, i) => (t.startsWith('教練建議') ? i : -1)).filter(i => i >= 0);
    const switchAt = said.findIndex(t => /^深蹲做完 4 下，AI 評分平均 \d+ 分；開始數伏地挺身$/.test(t));
    assert.ok(switchAt >= 0, said.join('／'));
    assert.deepEqual(coachAt, [said.length - 1], said.join('／'));
    assert.equal(said[said.length - 1], '教練建議：每一下都蹲到位，節奏很穩，下次可以試著多做兩下。');
    assert.deepEqual(page.errors, []);
    await context.close();
});

// 換動作的那幾秒同一下不能兩個動作都算（11/8 保養，auto-mode.js 的 dropRecounted）：深蹲 5 下、站 1 秒、弓箭步 6 下
// 以前 AI 還沒認出弓箭步的那幾秒，弓箭步的前 2 下也被數成深蹲（存成深蹲 7 下），換過去又重算成弓箭步
const SQUAT_LUNGE = script([stand('squat', 120), ...[1, 2, 3, 4, 5].flatMap(() => rep('squat', { hold: 10, rest: 20 })), stand('squat', 30),
    ...[1, 2, 3, 4, 5, 6].flatMap(() => rep('lunge', { hold: 10, rest: 20 })), stand('lunge', 60)]);

test('AI 全自動深蹲接弓箭步（11/8 保養）：換動作的那幾秒不會兩個動作都算，存成深蹲 5 下、弓箭步 6 下', async () => {
    const { context, page } = await open(browser, SQUAT_LUNGE);
    await context.addInitScript(() => { try { localStorage.setItem('aiAuto', '1'); } catch (e) {} });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('hudRepsName').textContent === '弓箭步', null, { timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '6', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    const read = await page.evaluate(() => ({
        auto: document.getElementById('autoSummaryBox').textContent,
        history: JSON.parse(localStorage.getItem('workoutHistory')).map(r => [r.workout, r.count])
    }));
    assert.deepEqual(read.history, [['squat', 5], ['lunge', 6]]);
    assert.equal(read.auto, '這次做了 2 個動作（AI 全自動）：深蹲 5 下 → 弓箭步 6 下（每個動作各存成一次運動，下面是最後一個）');
    const said = await page.evaluate(() => window.__said);
    assert.ok(said.some(t => /^深蹲做完 5 下，AI 評分平均 \d+ 分；開始數弓箭步$/.test(t)), said.join('／'));
    assert.deepEqual(page.errors, []);
    await context.close();
});
