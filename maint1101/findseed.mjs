// 找一組「整數毫秒會差、到小數第 2 位不會差」的時間（單元測試用，固定下來）：首頁的算法 vs 錄製檔→重播
import { script } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { P } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
import { repSeries } from '/home/user/claude-workspace/js/analysis/rep-series.js';
import { stabilityOf, stabilityLine } from '/home/user/claude-workspace/js/analysis/stability.js';
const hips = [P.LEFT_HIP, P.RIGHT_HIP];
const PLANK = script([{ id: 'squat', depth: 0, frames: 60 }, { id: 'plank', depth: 0, frames: 390 },
    { id: 'plank', depth: 0, frames: 390, move: (p, k, n) => (hips.includes(k) ? { ...p, y: p.y + 0.01 * Math.sin(n / 30 * 2 * Math.PI * 0.7) } : p) }]);
function run(times) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker('plank');
    times.forEach(([i, t]) => { const f = PLANK[i]; tracker.update(pipeline.process(f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })), t, 640, 480), t); });
    if (tracker.counter.current) tracker.interrupt();
    return stabilityLine(stabilityOf(repSeries('plank', tracker.items), 'plank'));
}
// 時間：從 seed 開始，每格 33.3 毫秒加上 ±6 毫秒（用 seed 算的，固定）
function times(seed) {
    let rnd = seed; const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const out = [], t0 = 1000.37;
    for (let t = t0; ; t += 33.3 + (r() - 0.5) * 12) { const i = Math.floor((t - t0) / (1000 / 30)); if (i >= PLANK.length) break; out.push([i, t]); }
    return out;
}
for (let seed = 1; seed < 80; seed++) {
    const ts = times(seed), t0 = ts[0][1];
    const a = run(ts), b = run(ts.map(([i, t]) => [i, Math.round(t - t0)])), c = run(ts.map(([i, t]) => [i, Math.round((t - t0) * 100) / 100]));
    if (a !== b && a === c) { console.log('seed', seed, '\n ', a, '\n ', b); }
}
