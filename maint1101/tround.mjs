// 11/1 保養：錄製檔把每一格的時間四捨五入到整數毫秒，重播算出來的會不會和首頁（原本的時間）差一點？
// 同一串棒式骨架、同樣的格子，時間用原本的（有小數）和四捨五入的各算一次
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
    times.forEach(([i, t]) => {
        const f = PLANK[i];
        tracker.update(pipeline.process(f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })), t, 640, 480), t);
    });
    if (tracker.counter.current) tracker.interrupt();
    return stabilityLine(stabilityOf(repSeries('plank', tracker.items), 'plank'));
}
let rnd = 7; const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const DIGITS = Number(process.argv[2] || 0), N = Number(process.argv[3] || 20);
const q = v => Math.round(v * 10 ** DIGITS) / 10 ** DIGITS;
let diff = 0;
for (let seed = 0; seed < N; seed++) {
    // 像瀏覽器一樣：每格大約 33 毫秒、有小數、偶爾慢一點；格子照時間拿
    const times = [];
    const t0 = 1000 + r() * 5000;
    for (let t = t0; ; t += 33.3 + (r() - 0.5) * 12) {
        const i = Math.floor((t - t0) / (1000 / 30));
        if (i >= PLANK.length) break;
        times.push([i, t]);
    }
    const a = run(times), b = run(times.map(([i, t]) => [i, q(t - t0)]));
    if (a !== b) { diff++; if (diff <= 2) console.log('不一樣：\n  原本的時間  ' + a + '\n  整數毫秒    ' + b); }
}
console.log('時間到小數第 ' + DIGITS + ' 位：' + N + ' 次裡不一樣的：' + diff);
