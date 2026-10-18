import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
const U='/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
const p = parseRecording(readFileSync(U+process.argv[2],'utf8'));
const [a,b]=process.argv.slice(3).map(Number);
const pl = new PosePipeline(); const g = pl.ghost ?? pl.filter;
console.log(Object.keys(pl));
let last='';
for (const fr of p.frames) {
  const o = pl.process(fr.raw, fr.t, 480, 640);
  const s = fr.t/1000; if (s<a||s>b) continue;
  const gh = pl.ghost || pl.ghostFilter;
  const st = o ? 'shown '+o.landmarks.filter(q=>q.visible).length : 'none';
  const extra = gh ? JSON.stringify({gs: gh.ghostSize, n: gh.sizes && gh.sizes.length, last: gh.sizes && gh.sizes[gh.sizes.length-1]?.map(v=>+v.toFixed?.(3)||v)}) : '';
  const key = st.split(' ')[0];
  if (key!==last || Math.round(s*10)%10===0) { console.log(s.toFixed(1), st, extra); last=key; }
}
