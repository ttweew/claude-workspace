// 比較預測的幾種「減速時收回」做法：真實感深蹲（合成，含雜訊）＋ 突然停住
import { PoseSmoother } from '/home/user/claude-workspace/js/skeleton/smooth.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const W = 640, H = 480;
const KEYS = [11, 12, 23, 24, 25, 26, 27, 28, 13, 14, 15, 16];
const DZ = 40, FULL = 120, CAP = 150;
// gate：'none' 現在的做法；'raw1' 用最新一格的移動量；'raw1s' 同上但收回比例再平滑一點
function predictor(gate) {
    let prevRaw = null, prevT = 0, g = null;
    return (raw, s, vel, ahead, t) => {
        const dt = prevRaw ? t - prevT : 0;
        const out = s.map((p, i) => {
            const { vx, vy } = vel ? vel[i] : { vx: 0, vy: 0 };
            const speed = Math.hypot(vx * W, vy * H) * 1000;
            const f = Math.min(1, Math.max(0, (speed - DZ) / (FULL - DZ)));
            if (!f || !vel) return p;
            let k = 1;
            if (gate !== 'none' && prevRaw && dt > 0) {
                const rx = (raw[i].x - prevRaw[i].x) / dt, ry = (raw[i].y - prevRaw[i].y) / dt;
                const proj = ((rx * vx) * W * W + (ry * vy) * H * H) / ((vx * W) ** 2 + (vy * H) ** 2);
                k = Math.min(1, Math.max(0, proj));
                if (gate === 'raw1s') { g = g || s.map(() => 1); g[i] += 0.6 * (k - g[i]); k = g[i]; }
            }
            const a = Math.min(CAP, ahead) * f * f * (3 - 2 * f) * k;
            return { ...p, x: p.x + vx * a, y: p.y + vy * a };
        });
        prevRaw = raw; prevT = t;
        return out;
    };
}
function squat(gate, fps, latency, noise, tempo) {
    const truth = makeDemoRecording({ yaw: 8, fps: 120, noisePx: 0, seed: 1, tempo });
    const noisy = makeDemoRecording({ yaw: 8, fps: 120, noisePx: noise, seed: 9, tempo });
    const at = (rec, tMs) => rec.frames[Math.max(0, Math.min(rec.frames.length - 1, Math.round(tMs / (1000 / 120))))].landmarks;
    const sm = new PoseSmoother(), pr = predictor(gate);
    let eM = 0, nM = 0, eS = 0, nS = 0, jS = 0, jM = 0, nJS = 0, nJM = 0, last = null, maxE = 0;
    const dur = truth.frames[truth.frames.length - 1].t;
    for (let t = 0; t < dur - latency - 200; t += 1000 / fps) {
        const raw = at(noisy, t).map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
        const s = sm.smooth(raw, t);
        const drawn = gate === 'off' ? s : pr(raw, s, sm.velocity(), latency, t);
        const d = t + latency, real = at(truth, d), realPrev = at(truth, d - 50);
        let e = 0, speed = 0, j = 0;
        for (const i of KEYS) {
            e += Math.hypot((drawn[i].x - real[i][0]) * W, (drawn[i].y - real[i][1]) * H);
            speed += Math.hypot((real[i][0] - realPrev[i][0]) * W, (real[i][1] - realPrev[i][1]) * H);
            if (last) j += Math.hypot((drawn[i].x - last[i].x) * W, (drawn[i].y - last[i].y) * H);
        }
        e /= KEYS.length; speed /= KEYS.length; j /= KEYS.length; maxE = Math.max(maxE, e);
        if (speed > 2) { eM += e; nM++; } else { eS += e; nS++; if (last) { jS += j; nJS++; } }
        last = drawn;
    }
    return [eM / nM, eS / nS, maxE, jS / nJS];
}
function stop(gate, fps, latency, sp, noise) {
    const sm = new PoseSmoother(), pr = predictor(gate);
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const tx = t => 0.2 + Math.min(t, 1000) * sp / 1000 / W;
    let over = 0;
    for (let t = 0; t < 2500; t += 1000 / fps) {
        const raw = Array.from({ length: 33 }, () => ({ x: tx(t) + rnd() * noise * 2 / W, y: 0.5 + rnd() * noise * 2 / H, z: 0, visibility: 1 }));
        const s = sm.smooth(raw, t);
        const drawn = gate === 'off' ? s : pr(raw, s, sm.velocity(), latency, t);
        if (t + latency > 1000) over = Math.max(over, (drawn[0].x - tx(t + latency)) * W);
    }
    return over;
}
const f = r => r.map(x => x.toFixed(1)).join('／');
console.log('深蹲 欄位：動作中誤差／靜止誤差／最大誤差／靜止抖動（像素）');
for (const tempo of [undefined, { down: 0.6, bottom: 0, up: 0.6, rest: 0.3 }]) for (const noise of [1.5, 3]) for (const [fps, lat] of [[30, 40], [15, 80]]) {
    console.log(`${tempo ? '快' : '般'} 雜訊${noise} ${fps}/${lat} | ` + ['off', 'none', 'raw1', 'raw1s'].map(g => g + ' ' + f(squat(g, fps, lat, noise, tempo))).join(' | '));
}
console.log('突然停住 最大衝過頭（像素），雜訊 1.5');
for (const [fps, lat] of [[30, 40], [15, 80]]) for (const sp of [300, 600, 1200])
    console.log(`${fps}/${lat} ${sp}px/s | ` + ['off', 'none', 'raw1', 'raw1s'].map(g => g + ' ' + stop(g, fps, lat, sp, 1.5).toFixed(1)).join(' | '));
