import { readFileSync } from 'fs';
import { parseRecording, analyzeRecording, ANGLE_KEYS, VIEW_CODES, WORLD_BONES } from '/home/user/claude-workspace/js/data/replay-core.js';
const U = '/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
const text = readFileSync(U + '8d4abbdf-pose_20261005_144512.json', 'utf8');
const p = parseRecording(text);
const r = await analyzeRecording(p, 480, 640, { lab: true });
const rc = await analyzeRecording(parseRecording(readFileSync(U + '8e39ffcb-pose_20261005_144512.csv', 'utf8')), 480, 640, { lab: true });
let same = r.reps.length === rc.reps.length; for (let i = 0; i < r.angles.length; i++) { const a = r.angles[i], b = rc.angles[i]; if (!(a === b || (isNaN(a) && isNaN(b)) || Math.abs(a - b) < 0.05)) { same = false; break; } }
console.log('JSON/CSV 相同', same, '有骨架', (r.present.reduce((a, b) => a + b, 0) / r.n * 100).toFixed(1) + '%', '原始偵測', (r.rawPresent.reduce((a, b) => a + b, 0) / r.n * 100).toFixed(1) + '%');
console.log('深蹲次數', r.reps.length, r.reps.map(x => `#${x.n} ${x.start.toFixed(1)}-${x.end.toFixed(1)}s 最低膝${x.minKnee.toFixed(0)}° 髖${x.minHip === null ? '—' : x.minHip.toFixed(0)}° ${x.depth}${x.oblique ? '(斜)' : ''}`).join(' | '));
// 哪些時間沒畫骨架（偵測到但被擋）
const hid = []; for (let i = 0; i < r.n; i++) if (r.rawPresent[i] && !r.present[i]) hid.push(r.t[i]);
const segs = []; for (const t of hid) { const s = segs[segs.length - 1]; if (s && t - s[1] < 0.2) s[1] = t; else segs.push([t, t]); }
console.log('偵測到但沒畫骨架的時段', segs.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join(', '));
// 手機高度：每公分幾像素（站直的格子）
const B = (j) => j; const fr = p.frames;
const ratio = []; for (const t of [5, 26, 44, 56, 64]) {
  const f = fr.reduce((a, b) => Math.abs(b.t / 1000 - t) < Math.abs(a.t / 1000 - t) ? b : a);
  const L = f.raw, W = f.world; const d2 = (a, b) => Math.hypot((L[a].x - L[b].x) * 480, (L[a].y - L[b].y) * 640), d3 = (a, b) => Math.hypot(W[a].x - W[b].x, W[a].y - W[b].y, W[a].z - W[b].z) * 100;
  const mid = (o, a, b, k) => (o[a][k] + o[b][k]) / 2;
  const t2 = Math.hypot((mid(L, 11, 12, 'x') - mid(L, 23, 24, 'x')) * 480, (mid(L, 11, 12, 'y') - mid(L, 23, 24, 'y')) * 640), t3 = Math.hypot(mid(W, 11, 12, 'x') - mid(W, 23, 24, 'x'), mid(W, 11, 12, 'y') - mid(W, 23, 24, 'y'), mid(W, 11, 12, 'z') - mid(W, 23, 24, 'z')) * 100;
  ratio.push(`t${t}: 軀幹 ${(t2 / t3).toFixed(2)} 大腿 ${(d2(23, 25) / d3(23, 25)).toFixed(2)} 小腿 ${(d2(25, 27) / d3(25, 27)).toFixed(2)}`);
}
console.log('每公分幾像素（站直）', ratio.join(' | '));
const K = WORLD_BONES.length; const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
for (const [k, [, nm]] of WORLD_BONES.entries()) { const raw = [], st = []; for (let i = 0; i < r.n; i++) { raw.push(r.boneRaw[i * K + k] * 100); st.push(r.boneStable[i * K + k] * 100); } console.log(nm, '原始', q(raw, .5).toFixed(1), '±' + ((q(raw, .9) - q(raw, .1)) / 2).toFixed(1), '| 處理過', q(st, .5).toFixed(1), '±' + ((q(st, .9) - q(st, .1)) / 2).toFixed(1)); }
