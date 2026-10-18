import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
const p = parseRecording(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/' + (process.argv[2] || '2ef82f59-pose_20261005_133933.json'), 'utf8'));
const pl = new PosePipeline(); const aspect = 480 / 640;
let last = '';
for (const f of p.frames) {
  const out = pl.process(f.raw, f.t, 480, 640);
  const l = f.raw; if (!l) continue; const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y); const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const size = dist(mid(l[11], l[12]), mid(l[23], l[24])) + dist(l[11], l[12]) + dist(l[23], l[24]);
  const s = `${out ? '畫' : '藏'} ghostSize=${pl.ghosts.ghostSize.toFixed(3)}`;
  if (f.t / 1000 > (+process.argv[3] || 20.5) && f.t / 1000 < (+process.argv[4] || 33) && (s !== last || f.t % 1000 < 34)) { console.log((f.t / 1000).toFixed(2), 'size', size.toFixed(3), s); last = s; }
}
