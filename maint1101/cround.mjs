// 11/1 保養：錄製檔的座標存到小數第 5 位（640 寬約 0.006 像素）：真的 AI 給的座標小數很多位，重播算出來會不會差一點？
// 合成棒式加上很多位小數的雜訊（像真的 AI），時間不四捨五入，只比座標存到第 5 位前後
import { script } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { P } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
import { repSeries } from '/home/user/claude-workspace/js/analysis/rep-series.js';
import { stabilityOf, stabilityLine } from '/home/user/claude-workspace/js/analysis/stability.js';
import { summarize, describe } from '/home/user/claude-workspace/js/analysis/session.js';
const hips = [P.LEFT_HIP, P.RIGHT_HIP];
const PLANK = script([{ id: 'squat', depth: 0, frames: 60 }, { id: 'plank', depth: 0, frames: 390 },
    { id: 'plank', depth: 0, frames: 390, move: (p, k, n) => (hips.includes(k) ? { ...p, y: p.y + 0.01 * Math.sin(n / 30 * 2 * Math.PI * 0.7) } : p) }]);
let rnd = 11; const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const r5 = v => Number(v.toFixed(5));
function run(frames, round) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker('plank');
    frames.forEach((f, i) => {
        const t = 1000 + i * 33.3;
        tracker.update(pipeline.process(f.map(([x, y, z, visibility]) => ({ x: round(x), y: round(y), z: round(z), visibility: Number(visibility.toFixed(3)) })), t, 640, 480), t);
    });
    if (tracker.counter.current) tracker.interrupt();
    const s = summarize('plank', tracker.items, 0, 1);
    return stabilityLine(stabilityOf(repSeries('plank', tracker.items), 'plank')) + '｜' + describe(s)[0];
}
let diff = 0; const N = Number(process.argv[2] || 40);
for (let k = 0; k < N; k++) {
    const noisy = PLANK.map(f => f.map(([x, y, z, v]) => [x + (r() - 0.5) * 0.002, y + (r() - 0.5) * 0.002, z, Math.min(0.9999, v - r() * 0.01)]));
    const a = run(noisy, v => v), b = run(noisy, r5);
    if (a !== b) { diff++; if (diff <= 2) console.log('不一樣：\n  ' + a + '\n  ' + b); }
}
console.log('座標存到第 5 位：' + N + ' 次裡不一樣的：' + diff);
