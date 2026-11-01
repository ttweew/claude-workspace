// 11/1 保養：棒式首頁和重播的穩定度差 0.1°：首頁真的拿到的格子（usedFrames）vs 錄製檔裡的格子，一格一格比
const W = '/home/user/claude-workspace';
const H = await import(W + '/tests/browser/harness.mjs');
const { P } = await import(W + '/js/skeleton/landmarks.js');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(W + '/js/analysis/tracker.js');
const { repSeries } = await import(W + '/js/analysis/rep-series.js');
const { stabilityOf, stabilityLine } = await import(W + '/js/analysis/stability.js');
const { parseRecording, analyzeRecording } = await import(W + '/js/data/replay-core.js');
const { readFileSync } = await import('node:fs');
const hips = [P.LEFT_HIP, P.RIGHT_HIP];
const PLANK = H.script([{ id: 'squat', depth: 0, frames: 60 }, { id: 'plank', depth: 0, frames: 390 },
    { id: 'plank', depth: 0, frames: 390, move: (p, k, n) => (hips.includes(k) ? { ...p, y: p.y + 0.01 * Math.sin(n / 30 * 2 * Math.PI * 0.7) } : p) }]);
const site = await H.serve(), browser = await H.launch();
const { context, page } = await H.open(browser, PLANK);
await page.goto(site.base + 'index.html?workout=plank');
await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
await page.click('#startBtn');
await page.waitForFunction(() => !document.getElementById('stage').hidden);
await page.click('#dataBtn'); await page.click('#recordBtn'); await page.click('#dataBtn');
await page.waitForFunction(() => document.getElementById('hudReps').textContent === '0:24', null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.click('#dataBtn'); await page.click('#recordBtn');
const [json] = await Promise.all([page.waitForEvent('download'), page.click('#jsonBtn')]);
const recording = readFileSync(await json.path(), 'utf8');
await page.click('#dataBtn'); await page.click('#stopBtn');
await page.waitForFunction(() => !document.getElementById('summary').hidden);
const homeText = await page.textContent('#stabilityBox');
const used = await H.usedFrames(page);
await browser.close(); await site.close();
// 首頁照拿到的格子在 node 算一次（時間用原本的）
const pipeline = new PosePipeline(), tracker = new WorkoutTracker('plank');
for (const [i, t] of used) {
    const f = PLANK[i];
    const lm = f ? f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
    tracker.update(pipeline.process(lm, t, 640, 480), t);
}
if (tracker.counter.current) tracker.interrupt();
const nodeHome = stabilityLine(stabilityOf(repSeries('plank', tracker.items), 'plank'));
const rec = JSON.parse(recording);
const replay = await analyzeRecording(parseRecording(recording), 640, 480, { workout: 'plank' });
const nodeReplay = stabilityLine(stabilityOf(repSeries('plank', replay.reps), 'plank'));
console.log('瀏覽器首頁：', homeText);
console.log('node 首頁  ：', nodeHome);
console.log('node 重播  ：', nodeReplay);
console.log('首頁拿到', used.length, '格（第一格時間', used[0][1].toFixed(2), '）；錄製檔', rec.frames.length, '格');
// 錄製檔的每一格對到首頁拿到的哪一格（時間差）
const t0 = used.find(([i, t]) => Math.abs(t - used[0][1] - 0) >= 0)[1];
const recStartAbs = used.map(u => u[1]).find(t => true);
console.log('錄製檔前 3 格 t：', rec.frames.slice(0, 3).map(f => f.t), '；首頁拿到的前 5 格 t：', used.slice(0, 5).map(u => u[1].toFixed(2)));
console.log('home hold:', JSON.stringify(tracker.items.map(h => [h.n, +h.start.toFixed(3), h.seconds, h.sway, h.levelFront, h.levelBack])));
console.log('replay hold:', JSON.stringify(replay.reps.map(h => [h.n, +h.start.toFixed(3), h.seconds, h.sway, h.levelFront, h.levelBack])));
