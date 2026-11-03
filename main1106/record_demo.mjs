// 報告的備案：錄一段示範影片（1280×720，合成的：假的鏡頭畫面、示範動畫的火柴人骨架，不是真人）
//   1. 首頁選深蹲 → 開鏡頭 → 做 6 下（第 4、5 下上身前傾）→ 結束 → 運動總結
//   2. 重播分析 → 側面拍深蹲（合成的示範檔）→ 選深蹲 → 動作分析的表格（最後一欄 AI 判斷）
//   3. 研究成果頁
// 用法：node record_demo.mjs <輸出資料夾>
const W = '/home/user/claude-workspace';
const H = await import(W + '/tests/browser/harness.mjs');
const OUT = process.argv[2];
const site = await H.serve(), browser = await H.launch();
// 錄影：harness 的 open() 開新的瀏覽環境時加上錄影
const newContext = browser.newContext.bind(browser);
browser.newContext = opts => newContext({ ...opts, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
// 上身前傾：肩膀、頭、手往前（x 加大）；depth 越深越前傾
const { P } = await import(W + '/js/skeleton/landmarks.js');
const upper = new Set([P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_ELBOW, P.RIGHT_ELBOW, P.LEFT_WRIST, P.RIGHT_WRIST, P.LEFT_EAR, P.RIGHT_EAR, P.LEFT_EYE, P.RIGHT_EYE]);
const lean = (p, k) => (upper.has(k) ? { ...p, x: p.x + 0.09 } : p);
const stand = n => ({ id: 'squat', depth: 0, frames: n });
const frames = H.script([stand(90), ...[0, 0, 0, 1, 1, 0].flatMap(e => H.rep('squat', { hold: 15, rest: 40, move: e ? lean : undefined })), stand(90)]);
const { context, page } = await H.open(browser, frames, { width: 1280, height: 720 });
const pause = ms => page.waitForTimeout(ms);
await page.goto(site.base + 'index.html?workout=squat');
await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
await pause(4000);
await page.click('#startBtn');
await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
await page.waitForFunction(() => document.getElementById('hudReps').textContent === '6', null, { timeout: 120000 });
await pause(2500);
await page.click('#stopBtn');
await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
// 總結：從最上面開始，慢慢往下看到每一下的圖
await page.locator('#summary').evaluate(el => el.scrollIntoView({ block: 'start' }));
await pause(3500);
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 300); await pause(1800); }
// 重播分析
await page.goto(site.base + 'replay.html');
await pause(1500);
await page.click('#demoSide');
await page.waitForFunction(() => /已讀取/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 });
await pause(1500);
await page.selectOption('#workoutPick', 'squat');
await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
await page.locator('#squatCard').scrollIntoViewIfNeeded();
await pause(2000);
await page.locator('#aiBox').evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
await pause(2500);
await page.locator('#squatTable').evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await pause(4000);
// 研究成果頁
await page.goto(site.base + 'results.html');
await pause(2000);
for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 300); await pause(900); }
await pause(1000);
console.log('errors', page.errors, 'said', await page.evaluate(() => window.__said));
const video = page.video();
await context.close();
console.log('video', await video.path());
await browser.close(); await site.close();
