// 腳跟高度：站直時（膝 > 160°、側面）的中位數當基準，每一下（膝 < 150 的一段、最低 < 100°）持續 0.4 秒的最大值，減掉基準
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { measure } from '/home/user/claude-workspace/js/analysis/form.js';
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
for (const [name, f] of process.argv.slice(2).map(x => x.split('='))) {
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(); const seq = [], stand = [];
  for (const fr of p.frames) {
    const pose = pl.process(fr.raw, fr.t, W, H);
    if (!pose || pose.view.view === 'front') { seq.push(null); continue; }
    const m = measure(pose, 0);
    if (m.heel !== null && m.knee !== null && m.knee > 160) stand.push(m.heel * 100);
    seq.push(m.heel !== null && m.knee !== null && m.knee < 150 ? { t: fr.t / 1000, h: m.heel * 100, k: m.knee } : null);
  }
  const base = med(stand);
  let cur = []; const segs = [];
  for (const s of seq) { if (s) cur.push(s); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  const out = [];
  for (const r of segs) {
    if (r.length < 10 || Math.min(...r.map(x => x.k)) >= 100) continue;
    let best = -Infinity;
    for (let i = 0; i < r.length; i++) { let mn = Infinity, j = i; while (j < r.length && r[j].t - r[i].t < 0.4) { mn = Math.min(mn, r[j].h); j++; } if (j < r.length) best = Math.max(best, mn); }
    out.push(`${r[0].t.toFixed(0)}s:${Math.round(best)}→${Math.round(best - base)}`);
  }
  console.log(name.padEnd(8), '站直基準', base.toFixed(0) + '%', '(' + stand.length + ' 格)', '每一下 原始→減基準：', out.join('  '));
}
