import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { framingAdvice } from '/home/user/claude-workspace/js/analysis/framing.js';
for (const f of ['2ef82f59-pose_20261005_133933.json','e1f4647b-pose_20261005_134842.json']) {
  const p = parseRecording(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/'+f,'utf8'));
  const pl = new PosePipeline(); const cnt = {}; let last = null; const segs = [];
  for (const fr of p.frames) { const o = pl.process(fr.raw, fr.t, 480, 640); const a = o ? framingAdvice(o.landmarks).text : '(沒畫骨架)'; cnt[a]=(cnt[a]||0)+1; if (a!==last){segs.push(`${(fr.t/1000).toFixed(1)}s ${a}`); last=a;} }
  console.log(f.slice(14,29), cnt); console.log('  ', segs.slice(0,25).join(' → '));
}
