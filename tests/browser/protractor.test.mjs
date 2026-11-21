// 照片量角器（protractor.html）：也用另一個模型算（11/21，第 4 階段）——瀏覽器端到端，假的 MediaPipe 和假的 YOLO 播同一個站姿
//   選一張照片（網頁畫的一張純色圖，假的 AI 不看內容）→ 首頁選的模型（MediaPipe lite）找到人 →「也用另一個模型算」選 YOLO26n
//   → 兩個模型的角度並排、差距一樣（同一個站姿）；改回「不用」收起來；320 寬、axe-core
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, violations } from './harness.mjs';

const STAND = script([{ id: 'squat', depth: 0, frames: 900 }]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

test('照片量角器：也用另一個模型（YOLO26n）算，兩個模型的角度並排；改回不用就收起來；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, STAND, { width: 320, height: 720, mobile: true });
    await page.goto(site.base + 'protractor.html');
    assert.equal(await page.textContent('#aiLabel'), 'AI 算的（MediaPipe lite）');
    const options = await page.$$eval('#otherModel option', els => els.map(o => o.value));
    assert.deepEqual(options, ['', 'full', 'yolo-n', 'yolo-s'], '不用，或首頁選的以外的模型');
    // 一張 640×480 的純色圖（網頁自己畫的）
    const base64 = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        const g = c.getContext('2d');
        g.fillStyle = '#5a88b8';
        g.fillRect(0, 0, 640, 480);
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('#photoInput', { name: 'side.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await page.waitForFunction(() => /AI 找到人了/.test(document.getElementById('photoStatus').textContent), null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => document.getElementById('otherRow').hidden), true, '還沒選另一個模型：不顯示');
    await page.selectOption('#otherModel', 'yolo-n');
    await page.waitForFunction(() => !document.getElementById('otherRow').hidden && /°$/.test(document.getElementById('other').textContent), null, { timeout: 60000 });
    const read = () => page.evaluate(() => Object.fromEntries(['ai', 'diff', 'other', 'otherDiff', 'otherLabel'].map(id => [id, document.getElementById(id).textContent])));
    const r = await read();
    assert.equal(r.otherLabel, 'YOLO26n 算的');
    assert.equal(r.other, r.ai, '同一個站姿：兩個模型的角度一樣');
    assert.equal(r.otherDiff, r.diff);
    // 換一個關節：兩邊一起換
    await page.click('#jointPick label:nth-child(3)');
    const r2 = await read();
    assert.equal(r2.other, r2.ai);
    assert.deepEqual(await violations(page), []);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, '不超出畫面：' + overflow);
    // 改回不用：收起來
    await page.selectOption('#otherModel', '');
    assert.equal(await page.evaluate(() => document.getElementById('otherRow').hidden && document.getElementById('otherDiffRow').hidden), true);
    assert.deepEqual(page.errors, []);
    await context.close();
});
