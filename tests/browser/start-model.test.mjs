// 選好動作之後轉場到選 AI 的畫面（11/24 使用者：選了要做的動作之後，要有一個介面選 MediaPipe 還是 YOLO；
// 同一天下午：不要像設定一樣放在首頁，要做一個轉場的特效）：瀏覽器端到端，假的 MediaPipe、假的 YOLO、合成資料
//   四個大按鈕按了不開鏡頭：那顆按鈕放大成「用哪一個 AI 看你做深蹲？」的畫面（首頁、導覽列 inert，焦點在選了的那張卡片）
//   選 YOLO 再按「開始深蹲」用 YOLO 數；鏡頭打不開時畫面留著、寫原因，改好再按一次就開；結束回到首頁有「開始深蹲 · YOLO26n」
//   網址指定的動作不自動跳出；和「進階設定」的 AI 模型是同一個選擇；換家時用那一家上次選的大小；鍵盤方向鍵、Esc、「換動作」
//   系統設定「減少動態效果」時直接出現；自由模式（「只看骨架」）照樣按了直接開；320 寬、axe-core
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
// 轉場畫面現在的樣子；focus：焦點在哪（有 id 寫 id，卡片的圓點寫 mediapipe／yolo，首頁的大按鈕寫動作）
const screen = page => page.evaluate(() => {
    const active = document.activeElement;
    return {
        hidden: document.getElementById('modelScreen').hidden,
        title: document.getElementById('msTitle').textContent,
        legend: document.querySelector('#modelPick legend').textContent,
        cards: [...document.querySelectorAll('#modelPick .model-opt')].map(card => ({
            family: card.querySelector('input').value,
            name: card.querySelector('.mo-name').textContent,
            points: [...card.querySelectorAll('.mo-point')].map(p => p.textContent),
            checked: card.querySelector('input').checked
        })),
        go: document.getElementById('msGo').textContent,
        status: document.getElementById('msStatus').textContent,
        focus: active ? active.id || active.value || active.dataset.workout || active.tagName : null,
        inert: document.querySelector('.page').inert && document.querySelector('.site-nav').inert
    };
});
// 首頁：「開始深蹲 · …」那一行有沒有出現、#startBtn 寫什麼、哪一個大按鈕是上次選的
const home = page => page.evaluate(() => ({
    quick: !document.getElementById('quickLine').hidden,
    start: document.getElementById('startBtn').textContent,
    current: [...document.querySelectorAll('#workoutGrid .workout-btn')].filter(b => b.getAttribute('aria-current') === 'true').map(b => b.dataset.workout)
}));
// 展開的動畫播完：最後一個浮上來的（「開始」那一塊）完全不透明
const opened = page => page.waitForFunction(() => {
    const root = document.getElementById('modelScreen');
    return !root.hidden && root.classList.contains('open') && getComputedStyle(document.querySelector('.ms-foot')).opacity === '1';
}, null, { timeout: 5000 });
const closed = page => page.waitForFunction(() => document.getElementById('modelScreen').hidden, null, { timeout: 5000 });
// 換模型（背景載入 YOLO、換回 MediaPipe）做完：卡片又能按了、狀態寫已就緒
const switched = (page, name) => page.waitForFunction(n => {
    const status = document.getElementById('poseStatus').textContent;
    return status.includes('已就緒（' + n + ' 模型）') && ![...document.querySelectorAll('#modelPick input')].some(i => i.disabled);
}, name, { timeout: 30000 });

test('按深蹲：按鈕放大成選 AI 的畫面（不開鏡頭）；選 YOLO 按「開始深蹲」用 YOLO 數；鏡頭打不開時留著寫原因；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'index.html');
    await ready(page);
    // 第一次打開（沒選過動作）：和以前一樣，只有四個大按鈕和「只看骨架」
    assert.deepEqual(await home(page), { quick: false, start: '只看骨架（自由模式，不計次）', current: [] });
    assert.equal((await screen(page)).hidden, true);
    // 按深蹲：轉場到選 AI 的畫面，不開鏡頭
    await page.tap('#workoutGrid [data-workout="squat"]');
    await opened(page);
    assert.equal(await page.evaluate(() => document.getElementById('stage').hidden), true, '只選動作，不開鏡頭');
    let s = await screen(page);
    assert.equal(s.title, '深蹲');
    assert.equal(s.legend, '用哪一個 AI 看你做深蹲？');
    assert.equal(s.go, '開始深蹲');
    assert.deepEqual(s.cards.map(c => [c.family, c.name, c.checked]), [['mediapipe', 'MediaPipe lite', true], ['yolo', 'YOLO26n', false]]);
    assert.equal(s.cards[1].points[1], '沒有腳跟、腳尖，不判斷「腳跟離地」');
    assert.match(s.cards[1].points[2], /^第一次用要下載約 \d+ MB$/);
    assert.match(s.status, /已就緒/, '最下面那一行寫 AI 的狀態');
    assert.equal(s.focus, 'mediapipe', '焦點在選了的那張卡片的圓點');
    assert.equal(s.inert, true, '首頁和導覽列不能按');
    // 被蓋住的首頁拿不到焦點（鍵盤 Tab 不會跑到看不到的地方）
    assert.equal(await page.evaluate(() => {
        document.querySelector('#workoutGrid [data-workout="pushup"]').focus();
        return document.activeElement.dataset.workout || null;
    }), null);
    // 螢幕閱讀器：對話框的名字是動作；卡片念「MediaPipe lite 推薦」，重點當說明念
    assert.equal(await page.getByRole('dialog', { name: '深蹲' }).count(), 1);
    assert.equal(await page.getByRole('radio', { name: 'MediaPipe lite 推薦', exact: true }).count(), 1);
    // 小手機：不會左右捲動；「開始深蹲」一直在畫面裡（固定在最下面）；無障礙檢查
    // 容許 1 像素：按鈕的位置可能有小數（11/24 GitHub 上量過 640.05）
    const box = await page.evaluate(() => {
        const root = document.getElementById('modelScreen'), r = document.getElementById('msGo').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: innerHeight, over: root.scrollWidth - root.clientWidth };
    });
    assert.ok(box.top >= 0 && box.bottom <= box.h + 1, JSON.stringify(box));
    assert.equal(box.over, 0);
    assert.deepEqual(await violations(page, '#modelScreen'), []);
    // 選 YOLO：和進階設定的 AI 模型是同一個選擇，馬上在背景載入，最下面那一行看得到
    await page.tap('#modelPick input[value="yolo"]');
    await switched(page, 'YOLO26n');
    assert.equal(await page.inputValue('#modelSelect'), 'yolo-n');
    assert.equal(await page.evaluate(() => localStorage.getItem('poseModel')), 'yolo-n');
    s = await screen(page);
    assert.deepEqual(s.cards.map(c => c.checked), [false, true]);
    assert.equal(s.status, 'AI 模型已就緒（YOLO26n 模型）');
    // 鏡頭打不開（沒有允許使用相機）：畫面留著，最下面寫原因；改好再按一次「開始深蹲」就開
    await page.evaluate(() => {
        window.__realCamera = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    });
    await page.tap('#msGo');
    await page.waitForFunction(() => document.getElementById('msStatus').textContent.includes('相機權限被拒絕'), null, { timeout: 5000 });
    assert.equal((await screen(page)).hidden, false);
    assert.equal(await page.evaluate(() => document.getElementById('stage').hidden), true);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__realCamera; });
    await page.tap('#msGo');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    // 鏡頭畫面蓋上來：轉場畫面已經收掉、焦點在「結束」；用 YOLO 數，畫面寫不判斷的錯誤
    assert.equal((await screen(page)).hidden, true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'stopBtn');
    assert.equal(await page.textContent('#modelNote'), 'YOLO26n 沒有腳跟、腳尖的點：不判斷「腳跟離地」');
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '3', null, { timeout: 120000 });
    // 結束回到首頁：「開始深蹲 · YOLO26n」直接用上次選的 AI 開始
    await page.tap('#stopBtn');
    assert.deepEqual(await home(page), { quick: true, start: '開始深蹲 · YOLO26n', current: ['squat'] });
    assert.equal(await page.evaluate(() => document.querySelector('.page').inert), false);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('網址指定的動作不自動跳出；進階設定選的大小跟著寫；鍵盤方向鍵、Esc、「換動作」；減少動態效果直接出現；「只看骨架」照樣直接開', async () => {
    const { context, page } = await open(browser, SQUAT);
    await page.goto(site.base + 'index.html?workout=pushup');
    await ready(page);
    // 網址指定的動作（主畫面長按的捷徑）：不自動跳出（捷徑、完整回歸都直接按 #startBtn），首頁寫「開始伏地挺身 · MediaPipe lite」
    assert.deepEqual(await home(page), { quick: true, start: '開始伏地挺身 · MediaPipe lite', current: ['pushup'] });
    assert.equal((await screen(page)).hidden, true);
    // 進階設定選 full → 首頁的字跟著換
    await page.click('#advancedTitle');
    await page.selectOption('#modelSelect', 'full');
    await switched(page, 'full');
    assert.equal((await home(page)).start, '開始伏地挺身 · MediaPipe full');
    // 按伏地挺身：卡片寫 MediaPipe full；伏地挺身用 YOLO 每一種錯誤都判斷
    await page.click('#workoutGrid [data-workout="pushup"]');
    await opened(page);
    let s = await screen(page);
    assert.equal(s.legend, '用哪一個 AI 看你做伏地挺身？');
    assert.deepEqual(s.cards.map(c => [c.name, c.checked]), [['MediaPipe full', true], ['YOLO26n', false]]);
    assert.ok(s.cards[1].points.includes('做伏地挺身時每一種錯誤都判斷'), JSON.stringify(s.cards[1].points));
    // 鍵盤：焦點已經在選了的圓點上，方向鍵換成 YOLO（單選的一組，螢幕閱讀器也念得出來）
    assert.equal(s.focus, 'mediapipe');
    await page.keyboard.press('ArrowDown');
    await switched(page, 'YOLO26n');
    assert.equal(await page.inputValue('#modelSelect'), 'yolo-n');
    // 換回 MediaPipe：還是 full（不會變回 lite）
    await page.click('#modelPick input[value="mediapipe"]');
    await switched(page, 'full');
    assert.equal(await page.inputValue('#modelSelect'), 'full');
    // Esc：縮回伏地挺身那顆按鈕，焦點回去，首頁又能按
    await page.keyboard.press('Escape');
    await closed(page);
    assert.equal((await screen(page)).focus, 'pushup');
    assert.equal(await page.evaluate(() => document.querySelector('.page').inert), false);
    // 換成弓箭步：標題、YOLO 不判斷的錯誤跟著換；「換動作」也縮回去
    await page.click('#workoutGrid [data-workout="lunge"]');
    await opened(page);
    s = await screen(page);
    assert.deepEqual([s.title, s.legend, s.go], ['弓箭步', '用哪一個 AI 看你做弓箭步？', '開始弓箭步']);
    assert.ok(s.cards[1].points.includes('沒有腳跟、腳尖，不判斷「膝超過腳尖」'), JSON.stringify(s.cards[1].points));
    await page.click('#msBack');
    await closed(page);
    assert.equal((await screen(page)).focus, 'lunge');
    assert.deepEqual(await home(page), { quick: true, start: '開始弓箭步 · MediaPipe full', current: ['lunge'] });
    assert.deepEqual(await violations(page, '.start-card'), []);
    // 系統設定「減少動態效果」：按了直接出現（不展開、不浮上來），Esc 直接收起
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#workoutGrid [data-workout="squat"]');
    assert.deepEqual(await page.evaluate(() => {
        const root = document.getElementById('modelScreen');
        return [root.hidden, root.classList.contains('open'), getComputedStyle(root).transitionDuration, getComputedStyle(document.querySelector('.ms-foot')).opacity];
    }), [false, true, '0s', '1']);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('modelScreen').hidden), true);
    // 「只看骨架」：和以前一樣按了直接開（自由模式），「開始深蹲 · …」那一行藏起來
    await page.click('#freeBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    assert.deepEqual(await home(page), { quick: false, start: '只看骨架（自由模式，不計次）', current: [] });
    assert.deepEqual(page.errors, []);
    await context.close();
});
