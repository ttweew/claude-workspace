// 畫面裡有好幾個人（11/22，YOLO 才有：YOLO 一次找到畫面裡每一個人，MediaPipe 一次只找一個）：瀏覽器端到端，假的 YOLO、合成資料
//   旁邊多站一個人（比較遠、比較小，但分數比較高）：網站跟著運動的那個人，深蹲照樣數（11/21 以前挑分數最高的，會跳到旁邊的人身上）
//   點一下旁邊的人就改跟他（次數停住）；點沒有人的地方寫說明、照常跟著；點回運動的人又接著數
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep } from './harness.mjs';

const stand = (id, frames) => ({ id, depth: 0, frames });
const SQUAT = script([stand('squat', 60), ...[1, 2, 3, 4].flatMap(() => rep('squat', { hold: 10, rest: 40 })), stand('squat', 60)]);
const LONG = script([stand('squat', 60), ...Array.from({ length: 12 }, () => rep('squat', { hold: 10, rest: 40 })).flat(), stand('squat', 90)]);
// 旁邊的人：站著不動，縮小 0.7 倍、往右移畫面寬的 35%（在「先框出人」那一塊的邊上，有一半會被看到），分數 0.95（運動的人 0.9）
const BYSTANDER = { dx: 0.35, scale: 0.7, score: 0.95 };

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
// 點鏡頭畫面上的一點（鏡頭原始畫面的比例座標）：換成螢幕位置（影像在畫面裡置中、前鏡頭左右鏡像）
async function tapAt(page, x, y) {
    const p = await page.evaluate(([x, y]) => {
        const stage = document.getElementById('stage'), video = document.querySelector('video');
        const b = stage.getBoundingClientRect();
        const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
        const w = video.videoWidth * scale, h = video.videoHeight * scale;
        const left = (stage.clientWidth - w) / 2, top = (stage.clientHeight - h) / 2;
        const u = video.classList.contains('mirrored') ? 1 - x : x;
        const px = b.left + left + u * w, py = b.top + top + y * h;
        return { x: px, y: py, target: document.elementFromPoint(px, py).id };
    }, [x, y]);
    assert.equal(p.target, 'video', '點到的要是鏡頭畫面（不是蓋在上面的工具列）：' + p.target);
    await page.mouse.click(p.x, p.y);
}
const note = page => page.evaluate(() => {
    const el = document.getElementById('autoNote');
    return el.hidden ? '' : el.textContent;
});

test('旁邊多站一個人（比較小、分數比較高）：YOLO 跟著運動的那個人，深蹲 4 下照樣數', async () => {
    const { context, page } = await open(browser, SQUAT, { yoloOthers: [BYSTANDER] });
    await page.goto(site.base + 'index.html?model=yolo-n&workout=squat');
    await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 120000 });
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('點一下旁邊的人就改跟他（次數停住）；點沒有人的地方寫說明；點回運動的人又接著數', async () => {
    const { context, page } = await open(browser, LONG, { yoloOthers: [BYSTANDER] });
    await page.goto(site.base + 'index.html?model=yolo-n&workout=squat');
    await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => Number(document.getElementById('hudReps').textContent) >= 2, null, { timeout: 120000 });
    // 旁邊的人：腳底在 (0.83, 0.85)，身體中間約 (0.83, 0.6)
    await tapAt(page, 0.83, 0.6);
    await page.waitForFunction(() => document.getElementById('autoNote').textContent === '改跟著你點的那個人', null, { timeout: 5000 });
    const r1 = await reps(page);
    await page.waitForTimeout(6000);   // 運動的人這段時間做了一兩下，但現在跟著的是站著不動的人
    assert.equal(await reps(page), r1, '跟著旁邊站著的人：不會多數');
    // 點沒有人的地方（影像左邊的空地；角落會點到工具列，工具列不算點畫面）：照常跟著，寫說明
    await tapAt(page, 0.15, 0.3);
    await page.waitForFunction(() => /點的地方沒有找到人/.test(document.getElementById('autoNote').textContent), null, { timeout: 5000 });
    // 點回運動的人：又接著數
    await tapAt(page, 0.5, 0.45);
    await page.waitForFunction(() => document.getElementById('autoNote').textContent === '改跟著你點的那個人', null, { timeout: 5000 });
    await page.waitForFunction(r => Number(document.getElementById('hudReps').textContent) > r, r1, { timeout: 30000 });
    // 換了人會重新校正站姿：說明可能已經換成校正的結果
    assert.match(await note(page), /^(改跟著你點的那個人|已依你的站姿校正.*|)$/);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('MediaPipe（一次只找一個人）：點畫面沒有人的地方不會換人、不寫說明（和以前一樣）', async () => {
    const { context, page } = await open(browser, SQUAT);
    await page.goto(site.base + 'index.html?workout=squat');
    await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => Number(document.getElementById('hudReps').textContent) >= 1, null, { timeout: 120000 });
    await tapAt(page, 0.15, 0.3);
    await page.waitForTimeout(1500);
    assert.doesNotMatch(await note(page), /改跟著|沒有找到人/);
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 120000 });
    assert.deepEqual(page.errors, []);
    await context.close();
});
