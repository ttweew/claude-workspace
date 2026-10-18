import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { SquatCounter } from '/home/user/claude-workspace/js/analysis/squat.js';
const p = parseRecording(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/8d4abbdf-pose_20261005_144512.json', 'utf8'));
const pl = new PosePipeline(), sq = new SquatCounter(); let last = '';
for (const f of p.frames) {
  const o = pl.process(f.raw, f.t, 480, 640); const u = sq.update(o, f.t); const t = f.t / 1000;
  if (t < 64 || t > 97) continue;
  const s = `${u.state} side=${sq.side || ''} knee=${u.knee === null ? '—' : Math.round(u.knee)} view=${o ? o.view.view : 'none'} prompt=${u.prompt || ''} L=${o && o.angles.LEFT_KNEE !== null ? Math.round(o.angles.LEFT_KNEE) : '—'} R=${o && o.angles.RIGHT_KNEE !== null ? Math.round(o.angles.RIGHT_KNEE) : '—'}`;
  const key = s.replace(/knee=\S+|L=\S+|R=\S+/g, '');
  if (key !== last || Math.abs(t * 2 - Math.round(t * 2)) < 0.02) { console.log(t.toFixed(2), s, u.rep ? 'REP ' + JSON.stringify(u.rep) : ''); last = key; }
}
