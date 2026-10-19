// 所有錄影裡每一下深蹲（膝 < 150 的一段、最低 < 100°）：持續 0.4 秒的前傾高度最大值、這段是側面還是斜側面
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { measure } from '/home/user/claude-workspace/js/analysis/form.js';
const all = [];
for (const [name, f] of process.argv.slice(2).map(x => x.split('='))) {
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(); const seq = [];
  for (const fr of p.frames) { const pose = pl.process(fr.raw, fr.t, W, H); if (!pose || pose.view.view === 'front') { seq.push(null); continue; } const m = measure(pose, 0); seq.push(m.lean !== null && m.knee !== null && m.knee < 150 ? { t: fr.t / 1000, h: m.lean, k: m.knee, v: pose.view.view } : null); }
  let cur = []; const segs = [];
  for (const s of seq) { if (s) cur.push(s); else if (cur.length) { segs.push(cur); cur = []; } }
  if (cur.length) segs.push(cur);
  for (const r of segs) {
    if (r.length < 10 || Math.min(...r.map(x => x.k)) >= 100) continue;
    let best = -Infinity;
    for (let i = 0; i < r.length; i++) { let mn = Infinity, j = i; while (j < r.length && r[j].t - r[i].t < 0.4) { mn = Math.min(mn, r[j].h); j++; } if (j < r.length) best = Math.max(best, mn); }
    const obl = r.filter(x => x.v === 'oblique').length / r.length;
    all.push({ name, t: r[0].t, k: Math.min(...r.map(x => x.k)), h: best, obl });
  }
}
const groups = { 側面: all.filter(x => x.obl < 0.3), 斜側面: all.filter(x => x.obl >= 0.3) };
for (const [g, arr] of Object.entries(groups)) {
  const c = th => arr.filter(x => x.h >= th).length;
  console.log(`${g}：${arr.length} 下（${[...new Set(arr.map(x => x.name))].join('、')}）≥40° ${c(40)}、≥45° ${c(45)}、≥50° ${c(50)}、≥60° ${c(60)}；最大 ${Math.max(...arr.map(x => x.h)).toFixed(0)}°`);
}
for (const x of all) console.log(x.name, x.t.toFixed(1) + 's', '膝', Math.round(x.k), '前傾', Math.round(x.h) + "°", x.obl >= 0.3 ? '斜' : '側');
