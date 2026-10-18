// 全面掃描：拍攝角度 × 深蹲深度 × 前傾，看「判斷為側面時」角度誤差多大、「線段太短」擋掉多少
import { squatPose, project, angle2 } from './body.mjs';
import { computeAngles } from '/home/user/claude-workspace/js/analysis/angles.js';
import { ViewTracker } from '/home/user/claude-workspace/js/analysis/view.js';
import { LANDMARKS } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const W = 640, H = 480;
const toLm = p => LANDMARKS.map(([k]) => p[k] ? { x: p[k].x / W, y: p[k].y / H, z: 0, visibility: 0.99 } : { x: 0.5, y: 0.1, z: 0, visibility: 0.1 });
const stats = { side: [], oblique: [], front: [] }; const hidden = { side: 0, oblique: 0, front: 0 }, total = { side: 0, oblique: 0, front: 0 };
for (let yaw = 0; yaw <= 90; yaw += 5) for (let knee = 60; knee <= 180; knee += 10) for (const leanK of [0.2, 0.4, 0.6]) for (const sl of [0.35, 0.45, 0.55]) {
    const flex = 180 - knee;
    const P = squatPose({ knee, lean: flex * leanK, shankLean: flex * sl }).P;
    const truth = angle2(...['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'].map(k => project(P, 0)[k]));
    const p = project(P, yaw, 150, 320, 420);
    const l = toLm(p);
    const view = new ViewTracker().update(l, 1000, W, H).view;
    const a = computeAngles(l, W, H).LEFT_KNEE;
    total[view]++;
    if (a === null) hidden[view]++; else stats[view].push(Math.abs(a - truth));
}
for (const v of ['side', 'oblique', 'front']) {
    const e = stats[v].sort((x, y) => x - y);
    const q = f => e.length ? e[Math.min(e.length - 1, Math.floor(f * e.length))].toFixed(1) : '-';
    console.log(v.padEnd(8), '組數', total[v], '| 線段太短不給角度', hidden[v], '| 有給角度的誤差：中位數', q(0.5), '° 90% 以內', q(0.9), '° 最大', q(0.999), '°');
}
