// 腳跟往上移多少：每一下用「這一下開始前站直的那 1 秒」腳跟的位置當基準（人或鏡頭移動過也不怕），以小腿長為 100%
// 每一下取持續 0.4 秒的最大值；同時列出用整段站直的中位數當基準的結果（heelrise.mjs）比較
import { readFileSync } from 'fs';
const ROOT = process.env.ROOT || '/home/user/claude-workspace';
const { parseRecording } = await import(ROOT + '/js/data/replay-core.js');
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { clearerSide, isVisible, P } = await import(ROOT + '/js/skeleton/landmarks.js');
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const out = [];
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
  const segs = []; let cur = null;
  rows.forEach((r, i) => { if (r && r.k < 150) { if (!cur) cur = { from: i, to: i }; cur.to = i; } else if (cur && (!r || r.k >= 150)) { segs.push(cur); cur = null; } });
  if (cur) segs.push(cur);
  const res = [];
  for (const s of segs) {
    const seg = rows.slice(s.from, s.to + 1).filter(Boolean);
    if (seg.length < 10 || Math.min(...seg.map(x => x.k)) >= 100) continue;
    const t0 = seg[0].t;
    const before = rows.slice(0, s.from).filter(r => r && r.k > 160 && r.t >= t0 - 1.0);
    if (before.length < 5) { res.push(`${t0.toFixed(0)}s:?`); continue; }
    const baseY = med(before.map(r => r.hy)), shank = med(before.map(r => r.shank));
    let best = -Infinity;
    for (let i = 0; i < seg.length; i++) { let mn = Infinity, j = i; while (j < seg.length && seg[j].t - seg[i].t < 0.4) { mn = Math.min(mn, (baseY - seg[j].hy) / shank * 100); j++; } if (j < seg.length) best = Math.max(best, mn); }
    res.push(`${t0.toFixed(0)}s:${Math.round(best)}`);
    out.push({ name, v: best });
  }
  console.log(name.padEnd(8), res.join(' '));
}
