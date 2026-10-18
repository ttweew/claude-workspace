// 換 20 組隨機雜訊 × 3 種速度 × 3 種角度 × 3 種雜訊大小：選定的做法有沒有任何一組比原始差、比只平滑差
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { WorldStabilizer } from './stab.mjs';
const MAIN = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const ang = (a, b, c) => { const u = a.map((x, i) => x - b[i]), v = c.map((x, i) => x - b[i]); return Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1]+u[2]*v[2]) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI; };
function run(seed0, noise, yaw, tempo) {
  let seed = seed0; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const rec = makeDemoRecording({ yaw, noisePx: 0, depths: [80, 95, 120, 88, 100, 85], tempo });
  const truth = rec.frames.map(f => f.world), ph = truth[0].map(() => rnd() * 6.28);
  const obs = truth.map((fr, k) => fr.map((q, j) => [q[0] + gauss() * noise.xy, q[1] + gauss() * noise.xy, q[2] + gauss() * noise.z + noise.drift * Math.sin(k / 30 * 2.5 + ph[j]) + (rnd() < noise.spike ? (rnd() - 0.5) * 0.3 : 0)]));
  const score = est => { let p = 0, n = 0, a = 0, m = 0; est.forEach((fr, k) => { for (const j of MAIN) { p += Math.hypot(...[0, 1, 2].map(i => fr[j][i] - truth[k][j][i])); n++; } for (const [h, kn, an] of [[23, 25, 27], [24, 26, 28]]) { a += Math.abs(ang(fr[h], fr[kn], fr[an]) - ang(truth[k][h], truth[k][kn], truth[k][an])); m++; } }); return [p / n * 100, a / m]; };
  const apply = opt => { const s = new WorldStabilizer(opt); return obs.map((fr, k) => s.process(fr, rec.frames[k].t)); };
  return { raw: score(obs), smooth: score(apply({ smooth: true, bones: false, beta: 10 })), pick: score(apply({ smooth: true, bones: true, minDz: 0.35, blend: 0.5, quantile: 0.5, beta: 10 })) };
}
const NOISE = { 一般: { xy: 0.01, z: 0.04, drift: 0.03, spike: 0.02 }, 很大: { xy: 0.01, z: 0.08, drift: 0.06, spike: 0.02 }, 小: { xy: 0.01, z: 0.015, drift: 0.01, spike: 0.005 } };
const TEMPO = { 慢: { down: 1.5, bottom: 0.4, up: 1.5, rest: 0.4 }, 一般: undefined, 快: { down: 0.6, bottom: 0, up: 0.6, rest: 0.3 } };
let total = 0, worseRaw = [], worseSmooth = [], sum = { raw: [0, 0], smooth: [0, 0], pick: [0, 0] };
for (const [nn, noise] of Object.entries(NOISE)) for (const [tn, tempo] of Object.entries(TEMPO)) for (const yaw of [5, 45, 85]) for (let s = 1; s <= 20; s++) {
  const r = run(s * 7919, noise, yaw, tempo); total++;
  for (const k of ['raw', 'smooth', 'pick']) { sum[k][0] += r[k][0]; sum[k][1] += r[k][1]; }
  if (r.pick[0] > r.raw[0] + 0.05 || r.pick[1] > r.raw[1] + 0.1) worseRaw.push(`${nn}/${tn}/${yaw}° 種子${s}: 位置 ${r.raw[0].toFixed(1)}→${r.pick[0].toFixed(1)} 膝角 ${r.raw[1].toFixed(1)}→${r.pick[1].toFixed(1)}`);
  if (r.pick[0] > r.smooth[0] + 0.3 || r.pick[1] > r.smooth[1] + 0.3) worseSmooth.push(`${nn}/${tn}/${yaw}° 種子${s}: 膝角 ${r.smooth[1].toFixed(1)}→${r.pick[1].toFixed(1)}`);
}
for (const k of ['raw', 'smooth', 'pick']) console.log({ raw: '原始', smooth: '只平滑', pick: '平滑＋骨頭長度' }[k].padEnd(8), `平均位置誤差 ${(sum[k][0] / total).toFixed(2)} 公分，平均 3D 膝角誤差 ${(sum[k][1] / total).toFixed(2)}°`);
console.log(`共 ${total} 組；比原始差的 ${worseRaw.length} 組`, worseRaw.slice(0, 8));
console.log(`比只平滑明顯差（> 0.3）的 ${worseSmooth.length} 組`, worseSmooth.slice(0, 8));
