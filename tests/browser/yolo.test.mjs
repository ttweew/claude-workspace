// YOLO（11/21，讓使用者自己選模型）：瀏覽器端到端，假的 YOLO（harness.mjs 的 fakeLiteRt）、合成資料
//   選 YOLO26n：深蹲照樣數、鏡頭畫面和總結寫出「不判斷腳跟離地」、錄製檔記 YOLO 的名字
//   鏡頭開著換模型：MediaPipe lite → YOLO26n → lite，次數接著數；YOLO 的說明跟著出現、消失
//   首頁選單分兩組、選了 YOLO 有說明；320 寬的手機、axe-core
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, serve, open, script, rep, summary, violations } from './harness.mjs';

const stand = (id, frames) => ({ id, depth: 0, frames });
const SQUAT = script([stand('squat', 60), ...[1, 2, 3, 4].flatMap(() => rep('squat', { hold: 10, rest: 40 })), stand('squat', 60)]);
// 鏡頭開著換模型用：深蹲 12 下（換模型時畫面會停 1～2 秒，那幾下可能沒數到，所以排多一點）
const LONG = script([stand('squat', 60), ...Array.from({ length: 12 }, () => rep('squat', { hold: 10, rest: 40 })).flat(), stand('squat', 90)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

const reps = page => page.evaluate(() => Number(document.getElementById('hudReps').textContent) || 0);

test('選 YOLO26n：深蹲 4 下照樣數；鏡頭畫面、總結寫出「不判斷腳跟離地」；錄製檔記 yolo26n-pose；用 CPU、背景運算', async () => {
    const { context, page } = await open(browser, SQUAT);
    await page.goto(site.base + 'index.html?model=yolo-n&workout=squat');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    assert.match(await page.textContent('#poseStatus'), /已就緒/);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    const note = await page.evaluate(() => ({ hidden: document.getElementById('modelNote').hidden, text: document.getElementById('modelNote').textContent }));
    assert.equal(note.hidden, false);
    assert.equal(note.text, 'YOLO26n 沒有腳跟、腳尖的點：不判斷「腳跟離地」');
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 120000 });
    const perf = await page.textContent('#perfBtn');
    assert.match(perf, /^CPU/, '運算標籤：' + perf);
    await page.waitForTimeout(1500);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    const s = await summary(page);
    assert.match(s.lines[0], /^深蹲 4 下：/);
    assert.ok(s.lines.includes('這次用 YOLO26n 沒有腳跟、腳尖的點：不判斷「腳跟離地」'), s.lines.join(' / '));
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('錄製檔：用 YOLO 錄的記 yolo26n-pose，腳跟、腳尖的點看不到（visibility 0）', async () => {
    const { context, page } = await open(browser, SQUAT);
    await page.goto(site.base + 'index.html?model=yolo-n&workout=squat');
    await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '1', null, { timeout: 60000 });
    // 錄製鈕、下載鈕在「數據」面板裡
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    await page.waitForFunction(() => document.getElementById('recordBtn').classList.contains('recording'), null, { timeout: 5000 });
    await page.waitForTimeout(2500);
    await page.click('#recordBtn');
    await page.waitForFunction(() => !document.getElementById('recordBtn').classList.contains('recording'), null, { timeout: 5000 });
    const [json] = await Promise.all([page.waitForEvent('download'), page.click('#jsonBtn')]);
    const data = JSON.parse(readFileSync(await json.path(), 'utf8'));
    assert.equal(data.meta.model, 'yolo26n-pose');
    assert.equal(data.meta.modelChoice, 'yolo-n');
    const frame = data.frames.find(f => Array.isArray(f.landmarks) && f.landmarks.length === 33);
    assert.ok(frame, '有拍到人的格子');
    // 29～32：腳跟、腳尖；17～22：手指 → 看不到；沒有 3D 座標
    for (const i of [17, 18, 19, 20, 21, 22, 29, 30, 31, 32]) assert.equal(frame.landmarks[i][3], 0, '第 ' + i + ' 點');
    assert.ok(frame.landmarks[25][3] > 0.65, '膝蓋看得到');
    assert.equal(frame.world, null);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('鏡頭開著換模型：lite → YOLO26n → lite，次數接著數、說明跟著出現和消失、不出錯', async () => {
    const { context, page } = await open(browser, LONG);
    await page.goto(site.base + 'index.html?workout=squat');
    await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('modelNote').hidden), true, 'MediaPipe：沒有說明');
    await page.waitForFunction(() => Number(document.getElementById('hudReps').textContent) >= 2, null, { timeout: 60000 });
    const choose = key => page.evaluate(k => {
        const select = document.getElementById('modelLive');
        select.value = k;
        select.dispatchEvent(new Event('change'));
    }, key);
    await choose('yolo-n');
    await page.waitForFunction(() => /已就緒（YOLO26n 模型）/.test(document.getElementById('modelStatus').textContent), null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => document.getElementById('modelNote').hidden), false, 'YOLO：寫出不判斷腳跟離地');
    const atYolo = await reps(page);
    await page.waitForFunction(n => Number(document.getElementById('hudReps').textContent) >= n + 2, atYolo, { timeout: 60000 });
    await choose('lite');
    await page.waitForFunction(() => /已就緒（lite 模型）/.test(document.getElementById('modelStatus').textContent), null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => document.getElementById('modelNote').hidden), true, '換回 MediaPipe：說明收起來');
    const atLite = await reps(page);
    await page.waitForFunction(n => Number(document.getElementById('hudReps').textContent) >= n + 2, atLite, { timeout: 60000 });
    // 記住的是最後選的
    assert.equal(await page.evaluate(() => localStorage.getItem('poseModel')), 'lite');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('首頁：AI 模型選單分 MediaPipe、YOLO 兩組；選 YOLO 有說明（沒有腳跟腳尖、要下載多少、授權）；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'index.html');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    const groups = await page.evaluate(() => [...document.querySelectorAll('#modelSelect optgroup')].map(g => [g.label, [...g.children].map(o => o.value)]));
    assert.deepEqual(groups, [['MediaPipe（Google）', ['lite', 'full', 'auto']], ['YOLO（Ultralytics，實驗）', ['yolo-n', 'yolo-s']]]);
    await page.click('#advancedTitle');
    await page.selectOption('#modelSelect', 'yolo-s');
    const hint = await page.textContent('#modelPickHint');
    assert.match(hint, /只有 17 個點/);
    assert.match(hint, /腳跟離地/);
    assert.match(hint, /AGPL-3\.0/);
    assert.match(await page.textContent('#advancedNote'), /YOLO26s 模型/);
    // 換一家：先載入 YOLO26s，成功才關掉 MediaPipe（鏡頭沒開也會換）
    await page.waitForFunction(() => /已就緒（YOLO26s 模型）/.test(document.getElementById('modelStatus').textContent), null, { timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, '不超出畫面：' + overflow);
    assert.deepEqual(await violations(page, '#advanced'), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});
