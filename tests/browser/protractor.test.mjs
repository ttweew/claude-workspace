// 照片量角器（protractor.html）：也用另一個模型算（11/21，第 4 階段）——瀏覽器端到端，假的 MediaPipe 和假的 YOLO 播同一個站姿
//   選一張照片（網頁畫的一張純色圖，假的 AI 不看內容）→ 首頁選的模型（MediaPipe lite）找到人 →「也用另一個模型算」選 YOLO26n
//   → 兩個模型的角度並排、差距一樣（同一個站姿）；改回「不用」收起來；320 寬、axe-core
//   準確度比賽（11/22）：記下這一筆時兩個模型的角度都存；使用說明的驗證實驗分模型統計、寫同一張照片誰比較準
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

test('準確度比賽（11/22）：記下這一筆時兩個模型的角度都存；使用說明分模型算平均誤差、寫同一張照片誰比較準', async () => {
    const { context, page } = await open(browser, STAND);
    await page.goto(site.base + 'protractor.html');
    const base64 = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 480;
        c.getContext('2d').fillRect(0, 0, 640, 480);
        return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('#photoInput', { name: 'side.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await page.waitForFunction(() => /AI 找到人了/.test(document.getElementById('photoStatus').textContent), null, { timeout: 60000 });
    await page.selectOption('#otherModel', 'yolo-n');
    await page.waitForFunction(() => !document.getElementById('otherRow').hidden && /°$/.test(document.getElementById('other').textContent), null, { timeout: 60000 });
    await page.click('#saveBtn');
    await page.waitForFunction(() => /已記下第 1 筆/.test(document.getElementById('saveStatus').textContent), null, { timeout: 5000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('angleSnapshots'))[0]);
    assert.equal(saved.model, 'lite');
    assert.equal(saved.other.model, 'yolo-n');
    assert.equal(saved.other.angles[saved.joint], saved.angles[saved.joint], '同一個站姿：兩個模型的角度一樣');
    // 使用說明：時間後面寫照片和模型；分模型的平均誤差；同一張照片兩個模型一樣準（同一個站姿、圈放在 AI 找到的位置）
    await page.goto(site.base + 'help.html');
    await page.waitForFunction(() => !document.getElementById('valModels').hidden, null, { timeout: 10000 });
    const rows = await page.$$eval('#valRows tr td:nth-child(2)', tds => tds.map(td => td.textContent));
    assert.match(rows[0], /（照片・MediaPipe lite）$/);
    const lines = await page.$$eval('#valModels li', lis => lis.map(li => li.textContent));
    assert.equal(lines.length, 3, lines.join(' / '));
    // 圈放在 AI 找到的位置：你量的和 AI 算的一樣（取到小數第 1 位可能差 0.1）
    assert.match(lines[0], /^MediaPipe lite：1 筆，平均誤差 0(\.1)?°/);
    assert.match(lines[1], /^YOLO26n：1 筆，平均誤差 0(\.1)?°/);
    assert.match(lines[2], /^同一張照片兩個模型都算了 1 張：MediaPipe lite 比較準 0 張、YOLO26n 比較準 0 張、一樣 1 張；平均誤差 MediaPipe lite ([\d.]+)°、YOLO26n \1°$/);
    assert.deepEqual(await violations(page, '#valTool'), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});
