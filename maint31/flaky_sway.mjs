// 10/31 保養：CI 上「深蹲 6 下」的晃動對不起來（瀏覽器第 5 下 6.1、node 每秒 30 格 6.7）
// 把電腦調慢（CPU 慢 rate 倍），看瀏覽器算的、每秒 30 格的、照真的拿到的格子重算的，三個差多少
// 用法：node flaky_sway.mjs <worktree> <rate...>
const W = process.argv[2];
const rates = process.argv.slice(3).map(Number);
const { launch, serve, open, script, rep, workout, summary, usedFrames } = await import(W + '/tests/browser/harness.mjs');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(W + '/js/analysis/tracker.js');
const stand = (id, frames) => ({ id, depth: 0, frames });
const rock = px => (p, k, n) => (k < 25 ? { ...p, x: p.x + px / 640 * Math.sin(n / 30 * 2 * Math.PI) } : p);
const SQUAT = script([stand('squat', 60), ...[0, 0, 0, 13, 13, 13].flatMap(px => rep('squat', { hold: 15, rest: 40, move: px ? rock(px) : undefined })), stand('squat', 60)]);
function inNode(frames, used = frames.map((f, i) => [i, i * 1000 / 30])) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker('squat');
    const done = [];
    for (const [i, ts] of used) {
        const f = frames[i];
        const lm = f ? f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
        const r = tracker.update(pipeline.process(lm, ts, 640, 480), ts);
        if (r.done) done.push(r.done.sway);
    }
    return done;
}
const site = await serve();
const browser = await launch();
let worst30 = 0, worstReplay = 0;
for (const rate of rates) {
    const { context, page } = await open(browser, SQUAT);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '6');
    const s = await summary(page);
    const sway = s.rows.map(r => parseFloat(r[5]));
    const used = await usedFrames(page);
    const n30 = inNode(SQUAT), rep = inNode(SQUAT, used);
    const skipped = used.length ? used[used.length - 1][0] + 1 - new Set(used.map(u => u[0])).size : -1;
    const d30 = Math.max(...sway.map((v, i) => Math.abs(v - n30[i]))), dr = Math.max(...sway.map((v, i) => Math.abs(v - rep[i])));
    worst30 = Math.max(worst30, d30); worstReplay = Math.max(worstReplay, dr);
    console.log(`rate ${rate}：拿了 ${used.length} 格、跳過 ${skipped} 格｜瀏覽器 ${sway}｜每秒30格 ${n30}（差 ${d30.toFixed(1)}）｜照拿到的格子 ${rep}（差 ${dr.toFixed(1)}）`);
    await context.close();
}
await browser.close(); await site.close();
console.log(`最大差：每秒30格 ${worst30.toFixed(1)}、照拿到的格子 ${worstReplay.toFixed(1)}`);
