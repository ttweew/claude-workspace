// 首頁先選動作、再選 AI（11/24 使用者：選了要做的動作之後，要有一個介面選 MediaPipe 還是 YOLO）：瀏覽器端到端，假的 MediaPipe、假的 YOLO、合成資料
//   四個大按鈕按了只選動作（不開鏡頭），下面出現「用哪一個 AI 看你做深蹲？」兩張卡片和「開始深蹲」；選 YOLO 再按開始用 YOLO 數
//   和「進階設定」的 AI 模型是同一個選擇；換家時用那一家上次選的大小；換動作卡片上的字跟著換；鍵盤用方向鍵換
//   自由模式（沒選過動作、「只看骨架」）照樣按了直接開；320 寬、axe-core
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, violations } from './harness.mjs';

const stand = (id, frames) => ({ id, depth: 0, frames });
const SQUAT = script([stand('squat', 60), ...[1, 2, 3].flatMap(() => rep('squat', { hold: 10, rest: 40 })), stand('squat', 60)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

const ready = page => page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
// 首頁「用哪一個 AI」：標題、每張卡片的名字、說明、有沒有選、能不能按
const pick = page => page.evaluate(() => ({
    hidden: document.getElementById('readyBox').hidden,
    title: document.querySelector('#modelPick legend').textContent,
    cards: [...document.querySelectorAll('#modelPick .model-opt')].map(card => ({
        family: card.querySelector('input').value,
        name: card.querySelector('.mo-name').textContent,
        sub: card.querySelector('.mo-sub').textContent,
        checked: card.querySelector('input').checked,
        disabled: card.querySelector('input').disabled
    })),
    start: document.getElementById('startBtn').textContent,
    pressed: [...document.querySelectorAll('#workoutGrid .workout-btn')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.workout)
}));
// 換模型（背景載入 YOLO、換回 MediaPipe）做完：卡片又能按了、狀態寫已就緒
const switched = (page, name) => page.waitForFunction(n => {
    const status = document.getElementById('poseStatus').textContent;
    return status.includes('已就緒（' + n + ' 模型）') && ![...document.querySelectorAll('#modelPick input')].some(i => i.disabled);
}, name, { timeout: 30000 });

test('按深蹲不會開鏡頭：下面出現「用哪一個 AI 看你做深蹲？」和「開始深蹲」；選 YOLO 再按開始用 YOLO 數；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'index.html');
    await ready(page);
    // 第一次打開（沒選過動作）：和以前一樣，只有四個大按鈕和「只看骨架」，沒有「用哪一個 AI」
    let p = await pick(page);
    assert.equal(p.hidden, true);
    assert.equal(p.start, '只看骨架（自由模式，不計次）');
    assert.deepEqual(p.pressed, []);
    await page.tap('#workoutGrid [data-workout="squat"]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.getElementById('stage').hidden), true, '只選動作，不開鏡頭');
    p = await pick(page);
    assert.equal(p.hidden, false);
    assert.equal(p.title, '用哪一個 AI 看你做深蹲？');
    assert.equal(p.start, '開始深蹲');
    assert.deepEqual(p.pressed, ['squat']);
    assert.deepEqual(p.cards.map(c => [c.family, c.name, c.checked]), [['mediapipe', 'MediaPipe lite', true], ['yolo', 'YOLO26n', false]]);
    assert.match(p.cards[1].sub, /點一下就能換人；沒有腳跟、腳尖，不判斷「腳跟離地」。第一次用要下載約 \d+ MB$/);
    // 小手機：選好動作後「開始深蹲」捲進畫面；不會左右捲動；無障礙檢查
    // 容許 1 像素：畫面捲動只能捲整數像素，按鈕的位置卻可能有小數（字型不同、高度有小數點）
    // （11/24 GitHub 上第一次跑：按鈕下緣 640.05、畫面高 640，只差 0.05 像素，看起來整顆都在畫面裡）
    const box = await page.evaluate(() => { const r = document.getElementById('startBtn').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight }; });
    assert.ok(box.top >= 0 && box.bottom <= box.h + 1, JSON.stringify(box));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    assert.deepEqual(await violations(page, '.start-card'), []);
    // 選 YOLO：和進階設定的 AI 模型是同一個選擇，馬上在背景載入
    await page.tap('#modelPick input[value="yolo"]');
    await switched(page, 'YOLO26n');
    assert.equal(await page.inputValue('#modelSelect'), 'yolo-n');
    assert.equal(await page.evaluate(() => localStorage.getItem('poseModel')), 'yolo-n');
    p = await pick(page);
    assert.deepEqual(p.cards.map(c => c.checked), [false, true]);
    // 按「開始深蹲」：用 YOLO 開鏡頭，畫面寫不判斷的錯誤，照樣數
    await page.tap('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    assert.equal(await page.textContent('#modelNote'), 'YOLO26n 沒有腳跟、腳尖的點：不判斷「腳跟離地」');
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '3', null, { timeout: 120000 });
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('換動作卡片上的字跟著換；換回 MediaPipe 用進階設定選的大小；鍵盤方向鍵也能換；「只看骨架」照樣直接開', async () => {
    const { context, page } = await open(browser, SQUAT);
    await page.goto(site.base + 'index.html?workout=pushup');
    await ready(page);
    let p = await pick(page);
    assert.equal(p.title, '用哪一個 AI 看你做伏地挺身？', '網址指定的動作（主畫面長按的捷徑）：直接出現');
    assert.equal(p.start, '開始伏地挺身');
    assert.match(p.cards[1].sub, /做伏地挺身時每一種錯誤都判斷/);
    // 進階設定選 full → 首頁的卡片跟著寫 MediaPipe full
    await page.click('#advancedTitle');
    await page.selectOption('#modelSelect', 'full');
    await switched(page, 'full');
    p = await pick(page);
    assert.deepEqual(p.cards.map(c => [c.name, c.checked]), [['MediaPipe full', true], ['YOLO26n', false]]);
    // 換 YOLO、再換回 MediaPipe：還是 full（不會變回 lite）
    await page.click('#modelPick input[value="yolo"]');
    await switched(page, 'YOLO26n');
    await page.click('#modelPick input[value="mediapipe"]');
    await switched(page, 'full');
    assert.equal(await page.inputValue('#modelSelect'), 'full');
    // 換成弓箭步：標題、YOLO 不判斷的錯誤跟著換
    await page.click('#workoutGrid [data-workout="lunge"]');
    p = await pick(page);
    assert.equal(p.title, '用哪一個 AI 看你做弓箭步？');
    assert.deepEqual(p.pressed, ['lunge']);
    assert.match(p.cards[1].sub, /不判斷「膝超過腳尖」/);
    // 鍵盤：選了的那個圓點上按方向鍵（單選的一組，螢幕閱讀器也念得出來）
    await page.focus('#modelPick input[value="mediapipe"]');
    await page.keyboard.press('ArrowDown');
    await switched(page, 'YOLO26n');
    assert.equal(await page.inputValue('#modelSelect'), 'yolo-n');
    // 「只看骨架」：和以前一樣按了直接開（自由模式），「用哪一個 AI」藏起來
    await page.click('#freeBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('readyBox').hidden), true);
    assert.equal(await page.textContent('#startBtn'), '只看骨架（自由模式，不計次）');
    assert.deepEqual(page.errors, []);
    await context.close();
});
