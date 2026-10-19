// 站直時和蹲低時的「腳跟比腳尖高」：如果站直時就有 20～30%，是拍攝角度造成的，不是腳跟真的離地
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { measure } from '/home/user/claude-workspace/js/analysis/form.js';
const [f, ...ranges] = process.argv.slice(2);
const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(); const rows = [];
for (const fr of p.frames) { const pose = pl.process(fr.raw, fr.t, W, H); if (!pose || pose.view.view === 'front') continue; const m = measure(pose, 1.7); if (m.heel === null || m.knee === null) continue; rows.push({ t: fr.t / 1000, heel: m.heel * 100, knee: m.knee, side: m.side, lean: m.lean }); }
const q = (a, x) => { const s = [...a].sort((u, v) => u - v); return s.length ? s[Math.floor((s.length - 1) * x)] : NaN; };
for (const r of ranges) {
  const [a, b] = r.split('-').map(Number);
  const sel = rows.filter(x => x.t >= a && x.t <= b);
  const stand = sel.filter(x => x.knee >= 160).map(x => x.heel), deep = sel.filter(x => x.knee < 100).map(x => x.heel), mid = sel.filter(x => x.knee >= 100 && x.knee < 160).map(x => x.heel);
  console.log(`${a}-${b}s 站直(膝≥160) ${stand.length}格 中位 ${q(stand, .5).toFixed(0)}% [${q(stand, .1).toFixed(0)}~${q(stand, .9).toFixed(0)}] | 半蹲 ${mid.length}格 中位 ${q(mid, .5).toFixed(0)}% | 蹲低(膝<100) ${deep.length}格 中位 ${q(deep, .5).toFixed(0)}% [${q(deep, .1).toFixed(0)}~${q(deep, .9).toFixed(0)}] 側 ${[...new Set(sel.map(x => x.side))]}`);
}
