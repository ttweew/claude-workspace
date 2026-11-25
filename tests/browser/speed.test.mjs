// 一鍵測速（11/25，js/ui/speed-card.js）：瀏覽器端到端，假的 MediaPipe、假的 YOLO（harness.mjs）、合成資料（站著不動的火柴人）
//   數據面板「測 AI 速度」：開始前寫要測哪幾個、最多下載多少；輪流用四個模型各量一次，表格四列都有數字，換回原本的模型（選的不變）
//   測的時候不能錄影、不能換模型和每秒格數；「複製結果」的文字和表格的數字一樣，有手機和鏡頭的資訊
//   手機 320 寬、從 YOLO26n 開始：YOLO26s 的檔案下載不到，那一列寫原因、其他照測，換回 YOLO26n
//   按「停止」：量好的留著、剩下的寫「沒測」，換回原本的模型；axe-core
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, violations } from './harness.mjs';

// 站著不動 80 秒：四個模型各量約 10 秒，加上換模型的時間（假 AI 的時間從第一次偵測開始算，排完了就是「沒有人」）
const STAND = script([{ id: 'squat', depth: 0, frames: 30 * 80 }]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

// 開鏡頭、打開數據面板、按「測 AI 速度」；複製的文字記在 window.__copied（測試環境不給網頁寫剪貼簿）
async function openCard(page, url) {
    await page.goto(site.base + url);
    await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied = t; } } });
    });
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.click('#dataBtn');
    await page.click('#speedBtn');
    await page.waitForFunction(() => !document.getElementById('speedTest').hidden);
    // 數據面板收起來（小手機上面板會蓋住卡片的按鈕），焦點在「開始」
    assert.equal(await page.evaluate(() => document.getElementById('dataPanel').hidden), true, '數據面板收起來');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'speedGo', '焦點在「開始」');
    // 記下卡片念出來的每一行（window.__speedSeen）：載入失敗的模型一下子就跳過，那一行可能只出現不到一格畫面，
    // 用等的會等不到（11/25 全部一起跑時抓到），所以每一次改字都記下來，測完再核對順序
    await page.evaluate(() => {
        const seen = window.__speedSeen = [];
        new MutationObserver(records => {
            for (const r of records) for (const n of r.addedNodes) seen.push(n.textContent);
        }).observe(document.getElementById('speedText'), { childList: true });
    });
}

// 測完之後核對：每個模型「第幾個／4 名字：」都出現過，而且照順序（order：模型的名字，照測的順序）
async function assertOrder(page, order) {
    const seen = await page.evaluate(() => window.__speedSeen);
    const firsts = order.map((name, i) => seen.findIndex(t => t.startsWith((i + 1) + '／4 ' + name + '：')));
    assert.ok(firsts.every(i => i >= 0), '每個模型都出現過：' + JSON.stringify(seen));
    assert.deepEqual([...firsts].sort((a, b) => a - b), firsts, '照順序：' + JSON.stringify(seen));
}

const speedText = page => page.textContent('#speedText');
// 等卡片念出來的那一行；等不到時寫出當下卡片上的字、秒數或下載進度、模型的狀態（找卡在哪裡）
async function waitText(page, re, timeout = 90000) {
    try {
        await page.waitForFunction(s => new RegExp(s).test(document.getElementById('speedText').textContent), re.source, { timeout });
    } catch (err) {
        const now = await page.evaluate(() => ['speedText', 'speedClock', 'modelStatus', 'poseStatus']
            .map(id => document.getElementById(id).textContent).join(' | ')).catch(() => '（讀不到）');
        throw new Error('等不到「' + re.source + '」，現在：' + now + '；網頁錯誤：' + JSON.stringify(page.errors));
    }
}
const rows = page => page.evaluate(() => [...document.querySelectorAll('#speedTable tbody tr')].map(tr => [...tr.children].map(c => c.textContent)));
const NAMES = ['MediaPipe lite', 'MediaPipe full', 'YOLO26n', 'YOLO26s'];

// 量到的一列：模型｜「22 毫秒」（後面可能接「lite 的 1.5 倍」）｜「30 格」｜GPU 或 CPU
function assertMeasured(row) {
    assert.equal(row.length, 4, row.join(' | '));
    assert.match(row[1], /^\d+ 毫秒(lite 的 \d+\.\d 倍)?$/, row.join(' | '));
    assert.match(row[2], /^\d+ 格$/, row.join(' | '));
    assert.match(row[3], /^(GPU|CPU)$/, row.join(' | '));
}

test('測 AI 速度：四個模型各量一次、換回原本的 lite（選的不變）；測的時候不能錄影、不能換模型；複製的文字和表格一樣', async () => {
    const { context, page } = await open(browser, STAND);
    await openCard(page, 'index.html?workout=squat');
    const intro = await speedText(page);
    assert.match(intro, /MediaPipe lite、full、YOLO26n、YOLO26s 各算約 10 秒/);
    assert.match(intro, /最多要下載約 43 MB/, '現在用 lite：full、YOLO 的引擎和兩個模型檔');
    assert.deepEqual(await violations(page, '#speedTest'), []);
    await page.click('#speedGo');
    await waitText(page, /^1／4 MediaPipe lite：/);
    const running = await page.evaluate(() => ({
        model: document.getElementById('modelLive').disabled,
        fps: document.getElementById('fpsLive').disabled,
        go: document.getElementById('speedGo').textContent,
        close: document.getElementById('speedClose').hidden
    }));
    assert.deepEqual(running, { model: true, fps: true, go: '停止', close: true });
    // 測的時候又打開數據面板、按錄製：不會錄（測到一半會換模型），卡片寫為什麼
    await page.click('#dataBtn');
    const label = await page.textContent('#recordBtn');
    await page.click('#recordBtn');
    await page.waitForTimeout(500);
    assert.equal(await page.textContent('#recordBtn'), label, '沒有開始錄');
    assert.match(await speedText(page), /測速中不能錄影/);
    await waitText(page, /^測完了/, 180000);
    assert.equal(await speedText(page), '測完了。現在用 MediaPipe lite（原本的）。');
    await assertOrder(page, NAMES);
    const table = await rows(page);
    assert.deepEqual(table.map(r => r[0]), NAMES);
    table.forEach(assertMeasured);
    // 換回 lite；使用者選的模型沒有被改（沒選過就還是沒選過）
    assert.match(await page.textContent('#modelStatus'), /已就緒（lite 模型）/);
    assert.equal(await page.evaluate(() => localStorage.getItem('poseModel')), null);
    const after = await page.evaluate(() => ({
        model: document.getElementById('modelLive').disabled,
        fps: document.getElementById('fpsLive').disabled,
        buttons: ['speedGo', 'speedCopy', 'speedClose'].map(id => document.getElementById(id)).filter(b => !b.hidden).map(b => b.textContent)
    }));
    assert.deepEqual(after, { model: false, fps: false, buttons: ['再測一次', '複製結果', '關閉'] });
    // 複製：每個模型一行，數字和表格一樣；手機、鏡頭的資訊
    await page.click('#speedCopy');
    await page.waitForFunction(() => typeof window.__copied === 'string');
    const copied = await page.evaluate(() => window.__copied);
    assert.match(copied, /^【AI 速度】\d{4}\/\d+\/\d+ \d+:\d{2}\n/);
    for (const r of table) {
        const ms = r[1].match(/^\d+ 毫秒/)[0];
        assert.ok(copied.includes(r[0] + '：每格 ' + ms), r[0] + '：' + copied);
        assert.ok(copied.includes('每秒 ' + r[2] + ' · ' + r[3]), r[0] + '：' + copied);
    }
    assert.match(copied, /\n鏡頭：640×480 · /);
    assert.match(copied, /\n識別字串：Mozilla/);
    assert.match(await page.textContent('#speedCopyStatus'), /已複製/);
    // 測完可以錄影了
    await page.click('#recordBtn');
    await page.waitForFunction(() => /停止/.test(document.getElementById('recordBtn').textContent), null, { timeout: 5000 });
    await page.click('#recordBtn');
    assert.deepEqual(await violations(page, '#speedTest'), []);
    // 「關閉」：卡片收起來，焦點回到工具列的「數據」
    await page.click('#speedClose');
    assert.equal(await page.evaluate(() => document.getElementById('speedTest').hidden), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'dataBtn');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('手機 320 寬、從 YOLO26n 開始：YOLO26s 的檔案下載不到，那一列寫原因、其他照測，換回 YOLO26n；卡片不超出畫面', async () => {
    const { context, page } = await open(browser, STAND, { width: 320, height: 640, mobile: true });
    // 後面加的攔截先用（Playwright 的規則）：YOLO26s 的模型檔下載不到
    await context.route('**/models/yolo/yolo26s*', route => route.fulfill({ status: 404, body: '' }));
    await openCard(page, 'index.html?workout=squat&model=yolo-n');
    assert.match(await speedText(page), /最多要下載約 38 MB/, '現在用 YOLO26n：MediaPipe 的引擎和兩個模型檔、YOLO26s 的模型檔');
    await page.click('#speedGo');
    await waitText(page, /^測完了/, 180000);
    assert.equal(await speedText(page), '測完了。現在用 YOLO26n（原本的）。');
    await assertOrder(page, ['YOLO26n', 'MediaPipe lite', 'MediaPipe full', 'YOLO26s']);
    const table = await rows(page);
    assert.deepEqual(table.map(r => r[0]), NAMES);
    table.slice(0, 3).forEach(assertMeasured);
    assert.deepEqual(table[3], ['YOLO26s', '載入失敗：下載或啟動失敗（請檢查網路）']);
    assert.match(await page.textContent('#modelStatus'), /已就緒（YOLO26n 模型）/);
    const overflow = await page.evaluate(() => {
        const card = document.querySelector('.speed-card').getBoundingClientRect();
        return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: card.right - window.innerWidth, left: card.left };
    });
    assert.ok(overflow.page <= 0 && overflow.right <= 0 && overflow.left >= 0, JSON.stringify(overflow));
    assert.deepEqual(await violations(page, '#speedTest'), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('按「停止」：量好的留著、剩下的寫「沒測」，換回原本的 lite；關鏡頭時卡片收起來', async () => {
    const { context, page } = await open(browser, STAND);
    await openCard(page, 'index.html?workout=squat');
    await page.click('#speedGo');
    await waitText(page, /^2／4 MediaPipe full：/);
    await page.click('#speedGo');
    await waitText(page, /^已停止/);
    assert.equal(await speedText(page), '已停止（按了停止）。現在用 MediaPipe lite（原本的）。');
    const table = await rows(page);
    assertMeasured(table[0]);
    assert.deepEqual(table.slice(1), [['MediaPipe full', '沒測'], ['YOLO26n', '沒測'], ['YOLO26s', '沒測']]);
    assert.match(await page.textContent('#modelStatus'), /已就緒（lite 模型）/);
    // 再測一次 → 關鏡頭：停下來、卡片收起來、換回 lite
    await page.click('#speedGo');
    await waitText(page, /^1／4 MediaPipe lite：/);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden || document.getElementById('stage').hidden, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('speedTest').hidden), true);
    await page.waitForFunction(() => /已就緒（lite 模型）/.test(document.getElementById('modelStatus').textContent), null, { timeout: 30000 });
    assert.deepEqual(page.errors, []);
    await context.close();
});
