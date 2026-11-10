// 報告的備案（11/8 保養；11/10 照新的現場示範腳本重錄：最後 2 下故意前傾）：錄一段「這週的 AI」示範影片（1280×720，合成的：假的鏡頭畫面、示範動畫的火柴人骨架，不是真人）
//   第一段：首頁打開「AI 全自動」、自由模式開鏡頭 → 站著 → 深蹲 5 下（第 4、5 下上身前傾：11/10 照新的現場示範腳本）：AI 認出深蹲自己開始數，
//           每一下的提示有 AI 判斷和分數 → 結束 → 運動總結的 AI 評分、AI 解釋、你這一下 vs 標準動作、教練建議
//   第二段：再開一次：深蹲 4 下 → 趴下做伏地挺身 4 下：AI 全自動換動作時卡片寫「深蹲做完 4 下，AI 評分平均…分；開始數伏地挺身」
//           → 結束：最上面「這次做了 2 個動作（AI 全自動）」
// 用法：node record_ai_demo.mjs <輸出資料夾>
const W = '/home/user/claude-workspace';
const H = await import(W + '/tests/browser/harness.mjs');
const OUT = process.argv[2];
const site = await H.serve(), browser = await H.launch();
const newContext = browser.newContext.bind(browser);
browser.newContext = opts => newContext({ ...opts, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const { P } = await import(W + '/js/skeleton/landmarks.js');
const upper = new Set([P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_ELBOW, P.RIGHT_ELBOW, P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_EAR, P.RIGHT_EAR, P.LEFT_EYE, P.RIGHT_EYE]);
const lean = (p, k) => (upper.has(k) ? { ...p, x: p.x + 0.09 } : p);
const stand = (id, n) => ({ id, depth: 0, frames: n });
// 第一段、第二段接在同一串骨架裡（假的 AI 從開鏡頭開始播；第二段重新整理網頁，從頭播第二串）
const part1 = H.script([stand('squat', 150), ...[0, 0, 0, 1, 1].flatMap(e => H.rep('squat', { hold: 15, rest: 40, move: e ? lean : undefined })), stand('squat', 300)]);
const part2 = H.script([stand('squat', 120), ...[0, 0, 0, 0].flatMap(() => H.rep('squat', { hold: 10, rest: 30 })), stand('squat', 60),
    ...[0, 0, 0, 0].flatMap(() => H.rep('pushup', { hold: 10, rest: 30 })), stand('pushup', 300)]);
const pause = ms => new Promise(r => setTimeout(r, ms));
const ready = page => page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
const videos = [];
for (const [n, frames] of [[1, part1], [2, part2]]) {
    const { context, page } = await H.open(browser, frames, { width: 1280, height: 720 });
    await context.addInitScript(() => { try { localStorage.setItem('aiAuto', '1'); } catch (e) {} });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    // 首頁：AI 全自動、手勢控制錄影的開關
    await page.locator('#aiAutoToggle').scrollIntoViewIfNeeded();
    await pause(2500);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    if (n === 1) {
        await page.waitForFunction(() => document.getElementById('hudReps').textContent === '5', null, { timeout: 120000 });
        await pause(3000);
    } else {
        await page.waitForFunction(() => document.getElementById('hudRepsName').textContent === '伏地挺身', null, { timeout: 120000 });
        await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 120000 });
        await pause(2500);
    }
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('coachStatus').textContent.includes('想一下'), null, { timeout: 15000 });
    await page.locator('#summary').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await pause(3500);
    if (n === 1) {
        for (const sel of ['#scoreSummaryBox', '#explainSummaryBox', '#poseCompareBox']) {
            await page.locator(sel).evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await pause(3500);
        }
    } else {
        await pause(2000);
    }
    console.log('part', n, 'errors', page.errors, 'said', (await page.evaluate(() => window.__said)).join('／'));
    const video = page.video();
    await context.close();
    videos.push(await video.path());
}
console.log('videos', videos.join(' '));
await browser.close(); await site.close();
