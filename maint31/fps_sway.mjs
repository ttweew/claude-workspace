// 同一組骨架，照不同的每秒格數（假 AI 照時間拿格子）在 node 算晃動：看慢的電腦會差多少
import { script, rep } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
const stand = (id, frames) => ({ id, depth: 0, frames });
const rock = px => (p, k, n) => (k < 25 ? { ...p, x: p.x + px / 640 * Math.sin(n / 30 * 2 * Math.PI) } : p);
const SQUAT = script([stand('squat', 60), ...[0, 0, 0, 13, 13, 13].flatMap(px => rep('squat', { hold: 15, rest: 40, move: px ? rock(px) : undefined })), stand('squat', 60)]);
function run(fps, jitter = 0, seed = 1) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker('squat');
    const done = [];
    let rnd = seed; const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let t = 0; ; t += 1000 / fps + (jitter ? (r() - 0.5) * jitter : 0)) {
        const f = SQUAT[Math.floor(t / (1000 / 30))];
        if (!f) break;
        const lm = f.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
        const o = tracker.update(pipeline.process(lm, t, 640, 480), t);
        if (o.done) done.push(o.done.sway);
    }
    return done.join(',');
}
for (const fps of [30, 25, 20, 15, 12, 10]) console.log(fps, run(fps));
for (const seed of [1, 2, 3, 4, 5]) console.log('30±jitter20', run(30, 20, seed), '| 15±jitter30', run(15, 30, seed));
