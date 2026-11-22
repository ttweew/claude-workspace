// YOLO 錄製檔每一格的面向（pipeline 的 view.facing）穩不穩：會不會左右跳
import { readFileSync } from 'node:fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
for (const f of process.argv.slice(2)) {
  const parsed = parseRecording(readFileSync(f, 'utf8'));
  const p = new PosePipeline();
  const seq = [];
  for (const fr of parsed.frames) {
    const r = p.process(fr.raw, fr.t, parsed.meta.videoWidth, parsed.meta.videoHeight);
    seq.push(r ? r.view.facing : 'x');
  }
  const counts = {};
  for (const s of seq) counts[s] = (counts[s] || 0) + 1;
  let flips = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) flips++;
  console.log(f.split('/').pop(), parsed.meta.model, JSON.stringify(counts), '換了', flips, '次', seq.slice(0, 40).join(''));
}
