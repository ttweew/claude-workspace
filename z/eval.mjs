// 用合成深蹲（有真實 3D 位置）加上接近真實的雜訊，比較公尺座標的處理方式
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { WorldStabilizer } from './stab.mjs';
const MAIN = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const ang = (a, b, c) => { const u = a.map((x, i) => x - b[i]), v = c.map((x, i) => x - b[i]); return Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1]+u[2]*v[2]) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI; };
function noisy(truth, { xy = 0.01, z = 0.04, drift = 0.03, spike = 0.02 }) {
  const phase = truth[0].map(() => rnd() * 6.28);
  return truth.map((fr, k) => fr && fr.map((q, j) => {
    const t = k / 30;
    const sp = rnd() < spike ? (rnd() - 0.5) * 0.3 : 0;
    return [q[0] + gauss() * xy, q[1] + gauss() * xy, q[2] + gauss() * z + drift * Math.sin(t * 2.5 + phase[j]) + sp];
  }));
}
function score(truth, est) {
  let pos = 0, np = 0, kneeErr = 0, nk = 0, jit = 0, nj = 0; const lens = [];
  est.forEach((fr, k) => {
    if (!fr || !truth[k]) return;
    for (const j of MAIN) { pos += Math.hypot(fr[j][0] - truth[k][j][0], fr[j][1] - truth[k][j][1], fr[j][2] - truth[k][j][2]); np++; }
    for (const [h, kn, a] of [[23, 25, 27], [24, 26, 28]]) { kneeErr += Math.abs(ang(fr[h], fr[kn], fr[a]) - ang(truth[k][h], truth[k][kn], truth[k][a])); nk++; }
    lens.push(Math.hypot(...[0, 1, 2].map(i => fr[25][i] - fr[23][i])));
    if (k && est[k - 1]) for (const j of MAIN) { jit += Math.hypot(...[0, 1, 2].map(i => fr[j][i] - est[k - 1][j][i])); nj++; }
  });
  const m = lens.reduce((a, b) => a + b, 0) / lens.length, sd = Math.sqrt(lens.reduce((a, b) => a + (b - m) ** 2, 0) / lens.length);
  return [pos / np * 100, kneeErr / nk, sd / m * 100, jit / nj * 100];
}
const fmt = r => `位置誤差 ${r[0].toFixed(1)} 公分 | 3D 膝角誤差 ${r[1].toFixed(1)}° | 大腿長度變動 ${r[2].toFixed(1)}% | 每格抖動 ${r[3].toFixed(2)} 公分`;
const variants = process.argv[2] === 'grid' ? Object.fromEntries([
  ['原始', null],
  ...[[0.8, 3], [0.8, 10], [0.5, 10], [1.2, 10], [0.8, 30], [0.5, 30], [1.2, 30], [2, 30]].map(([m, b]) => ['平滑 ' + m + '/' + b, { smooth: true, bones: false, minCutoff: m, beta: b }]),
  ['骨頭 50%（方向明確才修）', { smooth: true, bones: true, minDz: 0.35, blend: 0.5, quantile: 0.5, beta: 10 }],
  ['骨頭 100%（方向明確才修）', { smooth: true, bones: true, minDz: 0.35, blend: 1, quantile: 0.5, beta: 10 }],
]) : {
  '原始': null,
  '只平滑': { smooth: true, bones: false },
  '只骨頭長度': { smooth: false, bones: true },
  '平滑＋骨頭長度': { smooth: true, bones: true },
  '平滑(z 更強)＋骨頭長度': { smooth: true, bones: true, zMinCutoff: 0.4, zBeta: 1 },
};
for (const [label, noise] of [['一般雜訊', {}], ['深度雜訊很大', { z: 0.08, drift: 0.06 }], ['深度雜訊小', { z: 0.015, drift: 0.01, spike: 0.005 }]]) for (const yaw of [5, 45, 85]) {
  const rec = makeDemoRecording({ yaw, noisePx: 0, depths: [80, 95, 120, 88, 100, 85] });
  const truth = rec.frames.map(f => f.world);
  const obs = noisy(truth, noise);
  console.log(`\n== ${label}，拍攝角度 ${yaw}°`);
  for (const [name, opt] of Object.entries(variants)) {
    const est = opt ? (() => { const s = new WorldStabilizer(opt); return obs.map((fr, k) => s.process(fr, rec.frames[k].t)); })() : obs;
    console.log(name.padEnd(16), fmt(score(truth, est)));
  }
}
