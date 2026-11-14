// 智慧課表、每一下也唸 AI 分數、分享這次的結果（11/14，瀏覽器端到端，假的 AI）
//   首頁的課表卡片（勾選、理由、會記住）→ 按「開始課表」→ 深蹲做到了自動換伏地挺身（先講上一項的結果、準備幾秒）→ 課表完成 → 總結列出兩項
//   錄製中不能換下一項（卡片寫原因、照常講「完成目標」），停止錄製才換
//   分享：手機用系統的分享選單，不能用時複製；內容和畫面上的一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, workout, summary, violations } from './harness.mjs';

const hold = (id, frames) => ({ id, depth: 0, frames });
const squats = n => Array.from({ length: n }, () => rep('squat', { hold: 10, rest: 20 })).flat();
const pushups = n => Array.from({ length: n }, () => rep('pushup', { hold: 10, rest: 20 })).flat();
// 站 3 秒 → 深蹲 3 下 → 趴好撐著 8 秒（換姿勢、準備）→ 伏地挺身 3 下 → 撐著 3 秒
const PLAN = script([hold('squat', 90), ...squats(3), hold('pushup', 240), ...pushups(3), hold('pushup', 90)]);
// 錄製中做到了：深蹲 3 下之後多站 12 秒（等停止錄製），再趴好
const LOCKED = script([hold('squat', 90), ...squats(3), hold('squat', 360), hold('pushup', 300)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

const cardText = page => page.evaluate(() => document.getElementById('activityText').textContent);
const said = page => page.evaluate(() => window.__said.slice());
async function ready(page) {
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
}
// 目標設成 3 下（測試才不用做很久）、課表只做深蹲和伏地挺身
const setup = extra => `(() => { try {
  localStorage.setItem('workoutGoals', JSON.stringify({ squat: 3, pushup: 3 }));
  localStorage.setItem('planPicks', JSON.stringify(['squat', 'pushup']));
  ${extra || ''}
} catch (e) {} })();`;

test('智慧課表：首頁卡片 → 開始課表 → 深蹲做到了自動換伏地挺身（講結果、準備幾秒）→ 課表完成 → 總結列出兩項；每一下也唸 AI 分數；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, PLAN, { width: 320, height: 640, mobile: true });
    await context.addInitScript(setup("localStorage.setItem('scoreVoice', '1');"));
    await page.goto(site.base + 'index.html');
    await ready(page);
    // 首頁的卡片：一行課表、開始的按鈕；點開看每一項的理由和勾選
    assert.equal(await page.textContent('#planLine'), '深蹲 3 下 → 伏地挺身 3 下');
    assert.equal(await page.isEnabled('#planStart'), true);
    assert.equal(await page.isChecked('#scoreVoiceToggle'), true, '記住打開');
    await page.click('#planBox .plan-more summary');
    const rows = await page.$$eval('#planSteps li', list => list.map(li => ({
        name: li.querySelector('.plan-name').textContent, why: li.querySelector('.plan-why').textContent,
        checked: li.querySelector('input').checked, disabled: li.querySelector('input').disabled
    })));
    assert.deepEqual(rows, [
        { name: '深蹲 3 下', why: '照你設的目標', checked: true, disabled: false },
        { name: '伏地挺身 3 下', why: '照你設的目標', checked: true, disabled: false },
        { name: '棒式 20 秒', why: '還沒有紀錄，先從 20 秒開始', checked: false, disabled: false },
        { name: '弓箭步 10 下', why: '還沒有紀錄，先從 10 下開始', checked: false, disabled: false }
    ]);
    // 勾選會記住；只剩一項時不能再取消
    await page.check('#planSteps input[data-workout="lunge"]');
    assert.equal(await page.textContent('#planLine'), '深蹲 3 下 → 伏地挺身 3 下 → 弓箭步 10 下');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('planPicks'))), ['squat', 'pushup', 'lunge']);
    await page.uncheck('#planSteps input[data-workout="lunge"]');
    await page.uncheck('#planSteps input[data-workout="pushup"]');
    assert.equal(await page.isDisabled('#planSteps input[data-workout="squat"]'), true, '至少要做一項');
    await page.check('#planSteps input[data-workout="pushup"]');
    assert.equal(await page.textContent('#planLine'), '深蹲 3 下 → 伏地挺身 3 下');
    // 最小的手機：卡片在畫面裡、整頁不左右捲動；axe-core
    const box = await page.$eval('#planBox', el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(box.left >= 0 && box.right <= 320, '卡片在畫面裡：' + JSON.stringify(box));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#planBox'), []);

    // 開始課表：和選深蹲一樣開鏡頭，卡片寫第幾項、次數框寫目標
    await page.click('#planStart');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('activityTitle').textContent === '智慧課表', null, { timeout: 20000 });
    assert.equal(await cardText(page), '第 1／2 項：深蹲 3 下；做到了自動換伏地挺身');
    assert.equal(await page.textContent('#hudRepsName'), '目標 3');
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    // 站好之後講這一項要做什麼
    await page.waitForFunction(() => window.__said.includes('課表開始：深蹲 3 下'), null, { timeout: 20000 });
    // 做到了：自動換伏地挺身，先講上一項的結果（有 AI 評分平均）再講下一個；不另外講「完成目標」
    await page.waitForFunction(() => localStorage.getItem('workout') === 'pushup', null, { timeout: 40000 });
    const mid = await said(page);
    const moved = mid.find(t => t.includes('下一個：'));
    assert.match(moved, /^深蹲做完 3 下，AI 評分平均 \d+ 分；下一個：伏地挺身 3 下$/);
    assert.ok(!mid.some(t => t.includes('完成目標')), '課表換下一項時不講「完成目標」：' + JSON.stringify(mid));
    // 每一下也唸 AI 分數：前兩下「1 下，NN 分」（第 3 下做到目標，換下一項那一句代替）
    assert.match(mid.find(t => t.startsWith('1 下')), /^1 下，\d+ 分/);
    assert.match(mid.find(t => t.startsWith('2 下')), /^2 下，\d+ 分/);
    // 準備的幾秒：卡片倒數、次數框是伏地挺身的目標、還沒開始數
    assert.match(await cardText(page), /^第 2／2 項：伏地挺身 3 下，\d 秒後開始數$/);
    assert.equal(await page.textContent('#hudRepsName'), '目標 3');
    assert.equal(await page.textContent('#hudReps'), '0');
    // 準備完講「開始」，卡片換成這一項
    await page.waitForFunction(() => window.__said.includes('開始'), null, { timeout: 20000 });
    assert.equal(await cardText(page), '第 2／2 項：伏地挺身 3 下；最後一項');
    // 最後一項做到了：課表完成，不再數
    await page.waitForFunction(() => /^課表完成/.test(document.getElementById('activityText').textContent), null, { timeout: 60000 });
    assert.equal(await cardText(page), '課表完成：深蹲 3 下 → 伏地挺身 3 下；按「結束」看總結');
    const end = await said(page);
    assert.match(end.find(t => t.includes('課表完成')), /^伏地挺身做完 3 下(，AI 評分平均 \d+ 分)?；課表完成，一共 2 項$/);
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'free');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '鏡頭畫面不左右捲動');
    assert.deepEqual(await violations(page, '#activity'), []);
    await page.waitForTimeout(1000);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    // 總結：最上面列出這次課表做了哪些；下面是最後一項；兩項各存成一次運動、記著目標
    assert.equal(await page.textContent('#autoSummaryBox'), '這次做了 2 個動作（智慧課表）：深蹲 3 下 → 伏地挺身 3 下（每個動作各存成一次運動，下面是最後一個）');
    const s = await summary(page);
    assert.match(s.lines[0], /^伏地挺身 3 下/);
    assert.ok(s.lines.includes('目標 3 下：達成'), JSON.stringify(s.lines));
    const history = JSON.parse(await page.evaluate(() => localStorage.getItem('workoutHistory')));
    assert.deepEqual(history.map(h => [h.workout, h.count, h.goal]), [['squat', 3, 3], ['pushup', 3, 3]]);
    // 關了鏡頭課表就結束：卡片照新的紀錄重排（目標還是使用者設的 3 下）
    assert.equal(await page.textContent('#planLine'), '深蹲 3 下 → 伏地挺身 3 下');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('智慧課表：錄製中做到了不能換下一項（卡片寫原因、照常講「完成目標」），停止錄製才換過去', async () => {
    const { context, page } = await open(browser, LOCKED);
    await context.addInitScript(setup());
    await page.goto(site.base + 'index.html');
    await ready(page);
    assert.equal(await page.isChecked('#scoreVoiceToggle'), false, '每一下也唸 AI 分數預設關');
    await page.click('#planStart');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('activityTitle').textContent === '智慧課表', null, { timeout: 20000 });
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    await page.click('#dataBtn');
    await page.waitForFunction(() => /錄製中不能換下一項/.test(document.getElementById('activityText').textContent), null, { timeout: 40000 });
    assert.equal(await cardText(page), '第 1／2 項：深蹲 3 下做到了；錄製中不能換下一項（先停止錄製）');
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    const before = await said(page);
    assert.ok(before.includes('3 下，完成目標'), JSON.stringify(before));
    assert.ok(!before.some(t => t.includes('下一個：')));
    // 預設不唸分數
    assert.ok(before.includes('1 下') && before.includes('2 下'), JSON.stringify(before));
    // 停止錄製：馬上換過去
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    await page.click('#dataBtn');
    await page.waitForFunction(() => localStorage.getItem('workout') === 'pushup', null, { timeout: 10000 });
    assert.match((await said(page)).find(t => t.includes('下一個：')), /^深蹲做完 3 下(，AI 評分平均 \d+ 分)?；下一個：伏地挺身 3 下$/);
    assert.match(await cardText(page), /^第 2／2 項：伏地挺身 3 下/);
    // 做到一半按「結束」：做完的那一項已經存了，課表結束
    await page.click('#stopBtn');
    await page.waitForFunction(() => document.getElementById('stage').hidden, null, { timeout: 10000 });
    const history = JSON.parse(await page.evaluate(() => localStorage.getItem('workoutHistory')));
    assert.deepEqual(history.map(h => [h.workout, h.count]), [['squat', 3]]);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('智慧課表：棒式撐到秒數就換下一項（不另外講「時間到」），撐到那時的算一次；弓箭步做到了課表完成', async () => {
    const lunges = n => Array.from({ length: n }, () => rep('lunge', { hold: 10, rest: 20 })).flat();
    // 趴好撐 10 秒（撐到 5 秒就換）→ 站好（換姿勢、準備）→ 弓箭步 2 下
    const HOLD = script([hold('plank', 300), hold('lunge', 180), ...lunges(2), hold('lunge', 90)]);
    const { context, page } = await open(browser, HOLD);
    await context.addInitScript(`(() => { try {
      localStorage.setItem('workoutGoals', JSON.stringify({ plank: 5, lunge: 2 }));
      localStorage.setItem('planPicks', JSON.stringify(['plank', 'lunge']));
    } catch (e) {} })();`);
    await page.goto(site.base + 'index.html');
    await ready(page);
    assert.equal(await page.textContent('#planLine'), '棒式 5 秒 → 弓箭步 2 下');
    await page.click('#planStart');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('activityTitle').textContent === '智慧課表', null, { timeout: 20000 });
    assert.equal(await cardText(page), '第 1／2 項：棒式 5 秒；做到了自動換弓箭步');
    assert.equal(await page.textContent('#hudRepsName'), '目標 0:05');
    await page.waitForFunction(() => localStorage.getItem('workout') === 'lunge', null, { timeout: 40000 });
    const mid = await said(page);
    assert.match(mid.find(t => t.includes('下一個：')), /^棒式做完 1 次，最久 5 秒(，AI 評分平均 \d+ 分)?；下一個：弓箭步 2 下$/);
    assert.ok(!mid.includes('時間到'), '課表換下一項時不另外講「時間到」：' + JSON.stringify(mid));
    assert.ok(mid.includes('1'), '最後幾秒照樣倒數：' + JSON.stringify(mid));
    await page.waitForFunction(() => /^課表完成/.test(document.getElementById('activityText').textContent), null, { timeout: 60000 });
    assert.match((await said(page)).find(t => t.includes('課表完成')), /^弓箭步做完 2 下(，AI 評分平均 \d+ 分)?；課表完成，一共 2 項$/);
    await page.waitForTimeout(800);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    assert.equal(await page.textContent('#autoSummaryBox'), '這次做了 2 個動作（智慧課表）：棒式 1 次（最久 0:05） → 弓箭步 2 下（每個動作各存成一次運動，下面是最後一個）');
    const history = JSON.parse(await page.evaluate(() => localStorage.getItem('workoutHistory')));
    assert.deepEqual(history.map(h => [h.workout, h.count, Math.floor(h.best), h.goal]).map(r => (r[0] === 'plank' ? r : [r[0], r[1], r[3]])), [['plank', 1, 5, 5], ['lunge', 2, 2]]);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('實測模式開著時不能開始課表（寫原因）；關掉就可以', async () => {
    const { context, page } = await open(browser, PLAN);
    await page.goto(site.base + 'index.html');
    await ready(page);
    assert.equal(await page.textContent('#planLine'), '深蹲 10 下 → 伏地挺身 8 下 → 棒式 20 秒 → 弓箭步 10 下');
    assert.equal(await page.isEnabled('#planStart'), true);
    assert.equal(await page.isHidden('#planHint'), true);
    await page.click('#testToggle');
    assert.equal(await page.isDisabled('#planStart'), true);
    assert.equal(await page.textContent('#planHint'), '實測模式開著時不能用課表（每一組由主持人選）');
    await page.click('#testToggle');
    assert.equal(await page.isEnabled('#planStart'), true);
    assert.equal(await page.isHidden('#planHint'), true);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('分享這次的結果：手機用系統的分享選單，內容和畫面上的一樣（只有文字）；不能分享時複製', async () => {
    const SQUAT = script([hold('squat', 60), ...squats(3), hold('squat', 60)]);
    const { context, page } = await open(browser, SQUAT, { width: 390, height: 844, mobile: true });
    await context.addInitScript(() => {
        navigator.share = async data => { (window.__shared = window.__shared || []).push(data); };
    });
    await workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '3');
    assert.equal(await page.isVisible('#shareBtn'), true);
    await page.click('#shareBtn');
    await page.waitForFunction(() => window.__shared && window.__shared.length === 1, null, { timeout: 5000 });
    assert.equal(await page.textContent('#shareNote'), '已經送到分享選單');
    const shared = await page.evaluate(() => window.__shared[0]);
    assert.deepEqual(Object.keys(shared), ['text'], '只送文字');
    const lines = shared.text.split('\n');
    const s = await summary(page);
    assert.match(lines[0], /^AI 智慧運動分析系統｜\d+\/\d+ \d\d:\d\d$/);
    assert.deepEqual(lines.slice(1, 1 + s.lines.length), s.lines, '總結每一行和畫面上的一樣');
    assert.ok(lines.some(t => /^AI 評分/.test(t)), shared.text);
    assert.ok(lines.some(t => /^教練建議：/.test(t)), shared.text);
    assert.equal(lines[lines.length - 1], site.base);
    assert.ok(!shared.text.includes('這次做了'), '只做一個動作時沒有那一句');
    // 分享選單不能用（使用者關掉以外的錯誤）：改成複製到剪貼簿
    await page.evaluate(() => {
        navigator.share = async () => { throw new Error('not allowed'); };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied = t; } } });
    });
    await page.click('#shareBtn');
    await page.waitForFunction(() => typeof window.__copied === 'string', null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__copied), shared.text);
    assert.equal(await page.textContent('#shareNote'), '已複製，可以貼到 LINE 或訊息裡');
    // 使用者自己關掉分享選單：不複製、不寫字
    await page.evaluate(() => {
        window.__copied = null;
        navigator.share = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e; };
    });
    await page.click('#shareBtn');
    await page.waitForFunction(() => document.getElementById('shareNote').textContent === '', null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__copied), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#summary'), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});
