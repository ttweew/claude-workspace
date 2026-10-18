import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
const U='/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
const p = parseRecording(readFileSync(U+process.argv[2],'utf8'));
const [a,b,st]=process.argv.slice(3).map(Number);
const pl = new PosePipeline(); const g=pl.ghosts;
let k=0;
for (const fr of p.frames) {
  const o = pl.process(fr.raw, fr.t, 480, 640);
  const s = fr.t/1000; if (s<a||s>b) continue;
  if (k++%(st||6)) continue;
  const last=g.sizes[g.sizes.length-1]||[];
  console.log(s.toFixed(1), o?'shown':'NONE', 'size',last[1]?.toFixed(3),'torso',last[2]?.toFixed(3),'widths',last[3]?.toFixed(3),'ghostSize',g.ghostSize.toFixed(3));
}
