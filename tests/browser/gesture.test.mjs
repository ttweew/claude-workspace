// 手勢控制（11/8，瀏覽器端到端）：站著舉起右手過頭 2 秒開始錄影、再舉一次結束（錄好的存進錄製檔）；
// 舉著的時候畫面上倒數；首頁的開關關掉就不理手勢。做動作時不會誤觸：其他瀏覽器測試（深蹲、伏地挺身、棒式，手勢開著）照常
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script } from './harness.mjs';
import { demoLandmarks } from '../helpers.mjs';
import { P } from '../../js/skeleton/landmarks.js';

// 站著的示範姿勢：右手腕舉到鼻子上面 0.15（畫面高的比例），手肘在肩膀和鼻子中間；f 是舉起來的程度（0～1）
const base = demoLandmarks('squat', 0);
const nose = base[P.NOSE], shoulder = base[P.RIGHT_SHOULDER];
const toward = (p, x, y, f) => ({ ...p, x: p.x + (x - p.x) * f, y: p.y + (y - p.y) * f });
const raise = f => (p, k) => (k === P.RIGHT_WRIST ? toward(p, shoulder.x, nose.y - 0.15, f)
    : k === P.RIGHT_ELBOW ? toward(p, shoulder.x, (shoulder.y + nose.y) / 2 - 0.05, f) : p);
const stand = frames => ({ id: 'squat', depth: 0, frames });
const up = [0.25, 0.5, 0.75].map(f => ({ id: 'squat', depth: 0, frames: 2, move: raise(f) }));
const down = [0.75, 0.5, 0.25].map(f => ({ id: 'squat', depth: 0, frames: 2, move: raise(f) }));
const hold = frames => ({ id: 'squat', depth: 0, frames, move: raise(1) });
// 站 2 秒 → 舉 2.7 秒（開始錄影）→ 放下站 4 秒（錄著）→ 再舉 2.7 秒（結束）→ 站 3 秒
const SCRIPT = script([stand(60), ...up, hold(80), ...down, stand(120), ...up, hold(80), ...down, stand(90)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

async function start(page) {
    await page.goto(site.base + 'index.html?workout=free');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    assert.equal(await page.isChecked('#gestureToggle') , await page.evaluate(() => localStorage.getItem('gestureControl') !== '0'));
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
}

test('舉右手 2 秒開始錄影（舉著時倒數），再舉一次結束、存進錄製檔；320 寬', async () => {
    const { context, page } = await open(browser, SCRIPT, { width: 320, height: 640, mobile: true });
    await start(page);
    // 舉著的時候：「✋ 再舉 1.2 秒開始錄影」
    await page.waitForFunction(() => /^✋ 再舉 \d\.\d 秒開始錄影$/.test(document.getElementById('gestureNote').textContent), null, { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById('gestureNote').textContent === '✋ 手勢：開始錄影', null, { timeout: 10000 });
    // 測試工具把錄製前倒數設成 0：馬上開始錄
    await page.waitForFunction(() => document.getElementById('recordBtn').classList.contains('recording'), null, { timeout: 5000 });
    const note = await page.$eval('#gestureNote', el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(note.left >= 0 && note.right <= 320, '提示在畫面裡：' + JSON.stringify(note));
    await page.waitForFunction(() => /^✋ 再舉 \d\.\d 秒結束錄影$/.test(document.getElementById('gestureNote').textContent), null, { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById('gestureNote').textContent === '✋ 手勢：結束錄影', null, { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('recordBtn').classList.contains('recording'), null, { timeout: 5000 });
    // 錄好的一段存進錄製檔（數據面板的按鈕變成「錄下一段」）；只錄了一段
    assert.equal(await page.textContent('#recordBtn'), '● 錄下一段');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('首頁的「手勢控制錄影」關掉：舉手不會開始錄影（會記住）', async () => {
    const { context, page } = await open(browser, SCRIPT);
    await page.goto(site.base + 'index.html?workout=free');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    assert.equal(await page.isChecked('#gestureToggle'), true, '預設打開');
    await page.click('#gestureToggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('gestureControl')), '0');
    await page.reload();
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    assert.equal(await page.isChecked('#gestureToggle'), false, '重新整理後還是關著');
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    // 整段（約 15 秒）播完：一直沒有開始錄影、沒有手勢的提示
    const seen = await page.evaluate(() => new Promise(resolve => {
        let recorded = false, noted = false;
        const timer = setInterval(() => {
            recorded = recorded || document.getElementById('recordBtn').classList.contains('recording');
            noted = noted || !document.getElementById('gestureNote').hidden;
        }, 50);
        setTimeout(() => { clearInterval(timer); resolve({ recorded, noted }); }, 16000);
    }));
    assert.deepEqual(seen, { recorded: false, noted: false });
    assert.deepEqual(page.errors, []);
    await context.close();
});
