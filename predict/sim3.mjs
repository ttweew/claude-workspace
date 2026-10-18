import { PoseSmoother } from '/home/user/claude-workspace/js/skeleton/smooth.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const W = 640, H = 480;
const KEYS = [11, 12, 23, 24, 25, 26, 27, 28, 13, 14, 15, 16];
const tempoFast = { down: 0.6, bottom: 0, up: 0.6, rest: 0.3 };
function run({ fps, latency, mode, k = 1, noise = 1.5, tempo, cap = 120, lo = 0, hi = 0 }) {
    const truth = makeDemoRecording({ yaw: 8, fps: 120, noisePx: 0, seed: 1, tempo });
    const noisy = makeDemoRecording({ yaw: 8, fps: 120, noisePx: noise, seed: 9, tempo });
    const at = (rec, tMs) => rec.frames[Math.max(0, Math.min(rec.frames.length - 1, Math.round(tMs / (1000 / 120))))].landmarks;
    const sm = new PoseSmoother();
    let errMove = 0, nMove = 0, errStill = 0, nStill = 0, maxErr = 0, jitStill = 0, nJ = 0, last = null;
    const dur = truth.frames[truth.frames.length - 1].t;
    for (let t = 0; t < dur - latency - 200; t += 1000 / fps) {
        const raw = at(noisy, t).map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
        const s = sm.smooth(raw, t);
        const vel = sm.velocity ? sm.velocity() : null;  // 每個點的 { vx, vy }（每毫秒）
        for (let d = t + latency; d < t + latency + 1000 / fps; d += 1000 / 60) {
            let ahead = 0;
            if (mode === 'hold') ahead = 0;
            else if (mode === 'once') ahead = latency * k;            // 結果回來時預測一次
            else if (mode === 'live') ahead = Math.min(cap, d - t) * k;  // 每個螢幕畫面持續往前推
            const drawn = s.map((p, i) => {
                if (!vel) return p;
                // 死區：速度（像素／秒）低於 lo 不預測，lo～hi 之間逐漸加上
                const sp = Math.hypot(vel[i].vx * W, vel[i].vy * H) * 1000;
                const f = hi > lo ? Math.min(1, Math.max(0, (sp - lo) / (hi - lo))) : 1;
                const a = ahead * f * f * (3 - 2 * f);
                return { x: p.x + vel[i].vx * a, y: p.y + vel[i].vy * a };
            });
            const real = at(truth, d), realPrev = at(truth, d - 50);
            let e = 0, speed = 0, j = 0;
            for (const i of KEYS) {
                e += Math.hypot((drawn[i].x - real[i][0]) * W, (drawn[i].y - real[i][1]) * H);
                speed += Math.hypot((real[i][0] - realPrev[i][0]) * W, (real[i][1] - realPrev[i][1]) * H);
                if (last) j += Math.hypot((drawn[i].x - last[i].x) * W, (drawn[i].y - last[i].y) * H);
            }
            e /= KEYS.length; speed /= KEYS.length; j /= KEYS.length;
            maxErr = Math.max(maxErr, e);
            if (speed > 2) { errMove += e; nMove++; } else { errStill += e; nStill++; if (last) { jitStill += j; nJ++; } }
            last = drawn;
        }
    }
    return [errMove / nMove, errStill / nStill, maxErr, jitStill / nJ];
}
const fmt = r => r.map(x => x.toFixed(1)).join('／');
console.log('欄位：動作中／靜止／最大誤差／靜止抖動（像素）');
const cases = [['不預測', { mode: 'hold' }], ['預測一次', { mode: 'once' }], ['預測一次 死區 20～60', { mode: 'once', lo: 20, hi: 60 }], ['預測一次 死區 40～120', { mode: 'once', lo: 40, hi: 120 }], ['持續推 死區 40～120', { mode: 'live', lo: 40, hi: 120 }], ['持續推 死區 60～180', { mode: 'live', lo: 60, hi: 180 }]];
for (const tempo of [undefined, tempoFast]) for (const noise of [1.5, 3]) for (const [fps, latency] of [[30, 40], [15, 80]]) {
    console.log(`${tempo ? '快速' : '一般'} 雜訊${noise} ${fps}fps/${latency}ms | ` + cases.map(([n, o]) => n + ' ' + fmt(run({ fps, latency, noise, tempo, ...o }))).join(' | '));
}
