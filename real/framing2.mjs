import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { framingAdvice, FramingHint } from '/home/user/claude-workspace/js/analysis/framing.js';
import { P, isVisible } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const U='/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
for (const f of ['2ef82f59-pose_20261005_133933.json','e1f4647b-pose_20261005_134842.json','8d4abbdf-pose_20261005_144512.json']) {
  const p = parseRecording(readFileSync(U+f,'utf8'));
  const pl = new PosePipeline(); const h = new FramingHint(); let last=null; const segs=[]; const cnt={};
  for (const fr of p.frames) {
    const o = pl.process(fr.raw, fr.t, p.width||480, p.height||640);
    if (!o) continue;
    const s = h.update(framingAdvice(o.landmarks), fr.t).text;
    cnt[s]=(cnt[s]||0)+1;
    if (s!==last) {
      const lm=o.landmarks; const vis=k=>isVisible(lm[P[k]])?1:0;
      const kn = o.angles ? Object.entries(o.angles).filter(([k])=>/knee/i.test(k)).map(([k,v])=>k+':'+(v&&v.angle!=null?Math.round(v.angle):(typeof v==='number'?Math.round(v):'-'))).join(',') : '';
      const hipY = (lm[P.LEFT_HIP].y+lm[P.RIGHT_HIP].y)/2, ankY=Math.max(lm[P.LEFT_ANKLE].y,lm[P.RIGHT_ANKLE].y), kneeY=Math.max(lm[P.LEFT_KNEE].y,lm[P.RIGHT_KNEE].y);
      segs.push(`${(fr.t/1000).toFixed(1)}s ${s} [hipY ${hipY.toFixed(2)} kneeY ${kneeY.toFixed(2)} ankY ${ankY.toFixed(2)} vis LK${vis('LEFT_KNEE')}LA${vis('LEFT_ANKLE')}RK${vis('RIGHT_KNEE')}RA${vis('RIGHT_ANKLE')}] ${kn}`); last=s; }
  }
  console.log('==', f.slice(14,29), p.width, p.height, JSON.stringify(cnt)); console.log(segs.join('\n'));
}
