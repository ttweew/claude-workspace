// 模擬「骨架跟在身體後面」：AI 用 t 時刻的畫面，算完（延遲 L）才畫出來，畫的時候人已經移動了
// 比較：A. 現在的做法（結果回來才畫、畫的是 t 時刻的平滑位置）
//       B. 用平滑後的速度往前預測到「畫出來的時間」（預測量 = 延遲 × k）
// 量：畫面上骨架和「此刻真實位置」的距離（像素），動作中、靜止時（抖動）
import { PoseSmoother } from '/home/user/claude-workspace/js/skeleton/smooth.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const W = 640, H = 480;
// 真實（無雜訊）與輸入（有雜訊）的深蹲，用 120 fps 的細格當作連續時間
const truth = makeDemoRecording({ yaw: 8, fps: 120, noisePx: 0, seed: 1 });
const noisy = makeDemoRecording({ yaw: 8, fps: 120, noisePx: 1.5, seed: 9 });
const at = (rec, tMs) => rec.frames[Math.max(0, Math.min(rec.frames.length - 1, Math.round(tMs / (1000 / 120))))].landmarks;
const KEYS = [11, 12, 23, 24, 25, 26, 27, 28, 13, 14, 15, 16];
function run({ fps, latency, k }) {
    const sm = new PoseSmoother();
    const prev = { t: null, pts: null };
    let errMove = 0, nMove = 0, errStill = 0, nStill = 0, jit = 0, nj = 0, lastDrawn = null;
    const dur = truth.frames[truth.frames.length - 1].t;
    for (let t = 0; t < dur - latency; t += 1000 / fps) {
        const raw = at(noisy, t).map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
        const s = sm.smooth(raw, t);
        // 速度：用前一格平滑結果估計
        let drawn = s;
        if (k && prev.pts) {
            const dt = t - prev.t;
            drawn = s.map((p, i) => ({ ...p, x: p.x + (p.x - prev.pts[i].x) / dt * latency * k, y: p.y + (p.y - prev.pts[i].y) / dt * latency * k }));
        }
        prev.t = t; prev.pts = s;
        // 畫出來的時間是 t + latency，一直顯示到下一個結果（期間每 1/60 秒取樣誤差）
        for (let d = t + latency; d < t + latency + 1000 / fps; d += 1000 / 60) {
            const real = at(truth, d);
            const realPrev = at(truth, d - 50);
            let e = 0, speed = 0;
            for (const i of KEYS) {
                e += Math.hypot((drawn[i].x - real[i][0]) * W, (drawn[i].y - real[i][1]) * H);
                speed += Math.hypot((real[i][0] - realPrev[i][0]) * W, (real[i][1] - realPrev[i][1]) * H);
            }
            e /= KEYS.length; speed /= KEYS.length;
            if (speed > 2) { errMove += e; nMove++; } else { errStill += e; nStill++; }
        }
        if (lastDrawn) { let j = 0; for (const i of KEYS) j += Math.hypot((drawn[i].x - lastDrawn[i].x) * W, (drawn[i].y - lastDrawn[i].y) * H); jit += j / KEYS.length; nj++; }
        lastDrawn = drawn;
    }
    return { move: errMove / nMove, still: errStill / nStill };
}
console.log('情境（每秒格數、延遲） | 不預測：動作中／靜止 | 預測 50%：動作中／靜止 | 預測 100%：動作中／靜止（像素）');
for (const [fps, latency] of [[30, 40], [20, 60], [15, 80], [10, 120]]) {
    const r = [0, 0.5, 1].map(k => run({ fps, latency, k }));
    console.log(`${fps} fps、延遲 ${latency} ms | ${r.map(x => x.move.toFixed(1) + '／' + x.still.toFixed(1)).join(' | ')}`);
}
