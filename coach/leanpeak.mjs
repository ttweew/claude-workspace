// 每一下深蹲裡「持續 0.4 秒」的腳跟高度最大值（網站要持續 0.4 秒才報錯）：門檻要比這個高才不會誤報
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { measure } from '/home/user/claude-workspace/js/analysis/form.js';
const [f, a = 0, b = 1e9] = process.argv.slice(2);
const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(); const seq = [];
for (const fr of p.frames) { const t = fr.t / 1000; if (t < +a || t > +b) continue; const pose = pl.process(fr.raw, fr.t, W, H); if (!pose || pose.view.view === 'front') { seq.push(null); continue; } const m = measure(pose, 0); seq.push(m.lean !== null && m.knee !== null && m.knee < 150 ? { t, h: m.lean, k: m.knee } : null); }
// 連續的「膝 < 150」片段 = 一下
const reps = []; let cur = [];
for (const s of seq) { if (s) cur.push(s); else if (cur.length) { reps.push(cur); cur = []; } }
if (cur.length) reps.push(cur);
const out = [];
for (const r of reps) {
  if (r.length < 10) continue;
  let best = -Infinity;
  for (let i = 0; i < r.length; i++) { let mn = Infinity, j = i; while (j < r.length && r[j].t - r[i].t < 0.4) { mn = Math.min(mn, r[j].h); j++; } if (j < r.length) best = Math.max(best, mn); }
  out.push(`${r[0].t.toFixed(1)}s 最低膝${Math.round(Math.min(...r.map(x => x.k)))}° 持續0.4秒最大${best.toFixed(0)}%`);
}
console.log(out.join('\n'));
