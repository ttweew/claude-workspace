// balance.js（10/24）在 10/20 實測檔、教練影片上的數字：站直時重心在哪、前後晃動、每一下最底下時重心在哪
import { readFileSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording } = await import(ROOT + '/js/data/replay-core.js');
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { BalanceMeter } = await import(ROOT + '/js/analysis/balance.js');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : NaN; };
for (const f of process.argv.slice(2)) {
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(), bm = new BalanceMeter(); const rows = []; let n = 0;
  for (const fr of p.frames) {
    const pose = pl.process(fr.raw, fr.t, W, H); if (pose) n++;
    const b = bm.update(pose, fr.t);
    const knee = pose ? Math.min(...['LEFT_KNEE', 'RIGHT_KNEE'].map(k => pose.angles[k]).filter(v => v != null)) : NaN;
    rows.push(b && Number.isFinite(knee) ? { k: knee, b } : null);
  }
  const ok = rows.filter(Boolean), st = ok.filter(r => r.k > 160);
  const sw = ok.map(r => r.b.sway).filter(v => v !== null);
  const segs = []; let cur = null;
  rows.forEach((r, i) => { if (r && r.k < 150) { if (!cur) cur = { from: i, to: i }; cur.to = i; } else if (cur && (!r || r.k >= 150)) { segs.push(cur); cur = null; } });
  if (cur) segs.push(cur);
  const reps = segs.map(s => rows.slice(s.from, s.to + 1).filter(Boolean)).filter(seg => seg.length >= 10 && Math.min(...seg.map(x => x.k)) < 110)
    .map(seg => Math.round(seg.reduce((a, b) => (b.k < a.k ? b : a)).b.offset));
  console.log(f.split('/').pop().padEnd(20), '重心格', Math.round(ok.length / Math.max(1, n) * 100) + '%', '站直', Math.round(q(st.map(r => r.b.offset), 0.5)) + '%',
    '腳跟', q(ok.map(r => r.b.heel).filter(v => v !== null), 0.5), '腳尖', q(ok.map(r => r.b.toe).filter(v => v !== null), 0.5),
    '晃動 中位數', q(sw, 0.5), '90%', q(sw, 0.9), '| 最底下', reps.join(' '));
}
