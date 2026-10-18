import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
const U='/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
const NEW = await import('/home/user/claude-workspace/js/skeleton/pipeline.js');
const OLD = await import('./oldsk/pipeline.js');
for (const [f,w,h] of [['2ef82f59-pose_20261005_133933.json',480,640],['e1f4647b-pose_20261005_134842.json',480,640],['8d4abbdf-pose_20261005_144512.json',480,640],['8aafc90a-pose_20261006_213426.json',640,480],['b2f15efc-pose_20261006_220831.json',480,640]]) {
  const p = parseRecording(readFileSync(U+f,'utf8'));
  const res = {};
  for (const [name, M] of [['old',OLD],['new',NEW]]) {
    const pl = new M.PosePipeline(); let hid=0, segs=[], start=null, prevT=0;
    for (const fr of p.frames) {
      const o = pl.process(fr.raw, fr.t, w, h);
      const isHid = fr.raw && !o;
      if (isHid) { hid++; if (start===null) start=fr.t; } else if (start!==null) { if (fr.t-start>500) segs.push(`${(start/1000).toFixed(1)}-${(fr.t/1000).toFixed(1)}`); start=null; }
    }
    res[name] = `${(hid/30).toFixed(1)}s [${segs.join(' ')}]`;
  }
  console.log(f.slice(14,29), 'old', res.old, '| new', res.new);
}
