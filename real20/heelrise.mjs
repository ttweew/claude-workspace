// 另一種腳跟量法：腳跟的點比站直時「往上」移多少（以站直時的小腿長為 1），不看腳尖
// 想法：鏡頭不動，深蹲時腳跟應該一直貼地；腳尖的點在蹲低時常被擋住、位置亂跳
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { clearerSide, isVisible, P } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
for (const [name, f] of process.argv.slice(2).map(x => x.split('='))) {
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(); const rows = [];
  for (const fr of p.frames) {
    const pose = pl.process(fr.raw, fr.t, W, H);
    if (!pose || pose.view.view === 'front') { rows.push(null); continue; }
    const side = clearerSide(pose.landmarks);
    const L = k => pose.landmarks[P[side + '_' + k]];
    const hl = L('HEEL'), an = L('ANKLE'), kn = L('KNEE');
    const knee = pose.angles[side + '_KNEE'];
    if (![hl, an, kn].every(isVisible) || knee == null) { rows.push(null); continue; }
    rows.push({ t: fr.t / 1000, k: knee, hy: hl.y * H, shank: Math.hypot((kn.x - an.x) * W, (kn.y - an.y) * H) });
  }
  const st = rows.filter(r => r && r.k > 160);
  const baseY = med(st.map(r => r.hy)), shank = med(st.map(r => r.shank));
  let cur = []; const segs = [];
  for (const r of rows) { if (r && r.k < 150) cur.push(r); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  const out = [];
  for (const r of segs) {
    if (r.length < 10 || Math.min(...r.map(x => x.k)) >= 100) continue;
    let best = -Infinity;
    for (let i = 0; i < r.length; i++) { let mn = Infinity, j = i; while (j < r.length && r[j].t - r[i].t < 0.4) { mn = Math.min(mn, (baseY - r[j].hy) / shank * 100); j++; } if (j < r.length) best = Math.max(best, mn); }
    out.push(`${r[0].t.toFixed(0)}s:${Math.round(best)}`);
  }
  console.log(name.padEnd(8), '小腿', shank.toFixed(0) + 'px', '每一下腳跟往上（%）：', out.join(' '));
}
