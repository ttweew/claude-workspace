// 用改好的程式（wt-maint）重算四段教練影片，和改之前（專案目前的程式）比
import { readFileSync } from 'fs';
const f = process.argv[2];
async function count(root) {
  const { parseRecording } = await import(root + '/js/data/replay-core.js');
  const { PosePipeline } = await import(root + '/js/skeleton/pipeline.js');
  const { WorkoutTracker } = await import(root + '/js/analysis/tracker.js');
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(), tr = new WorkoutTracker('squat'); tr.useBaseline(p.meta.calibration);
  for (const fr of p.frames) tr.update(pl.process(fr.raw, fr.t, W, H), fr.t);
  return tr.items.map(r => ({ s: r.start, e: r.end, min: Math.round(r.min), d: r.depth, errors: r.errors.join('+') }));
}
const a = await count('/home/user/claude-workspace'), b = await count('/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-maint');
console.log(f, '改之前', a.length, '改之後', b.length, '錯誤：', a.map(x => x.errors).filter(Boolean).length, '→', b.map(x => x.errors).filter(Boolean).length);
for (const r of b) if (!a.some(x => Math.abs(x.s - r.s) < 0.3)) console.log('  多算到', r.s.toFixed(1) + '-' + r.e.toFixed(1) + 's', r.min, r.d, r.errors);
for (const r of a) if (!b.some(x => Math.abs(x.s - r.s) < 0.3)) console.log('  不算了', r.s.toFixed(1), r.e.toFixed(1));
for (const r of b) { const o = a.find(x => Math.abs(x.s - r.s) < 0.3); if (o && (o.errors !== r.errors)) console.log('  錯誤改變', r.s.toFixed(1) + 's', o.errors || '（無）', '→', r.errors || '（無）'); }
