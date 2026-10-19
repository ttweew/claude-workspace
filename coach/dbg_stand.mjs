import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
const p = parseRecording(readFileSync('v2.json', 'utf8'));
const pl = new PosePipeline(), tr = new WorkoutTracker('squat'); tr.useBaseline(p.meta.calibration);
for (const fr of p.frames) {
  const pose = pl.process(fr.raw, fr.t, 480, 640);
  const o = tr.update(pose, fr.t);
  const t = fr.t / 1000;
  if (t > 101.3 && t < 103.2) console.log(t.toFixed(2), pose ? pose.view.view : '-', 'v', o.count.value == null ? '-' : o.count.value.toFixed(0), 'state', o.count.state, 'up', tr.counter.config.up, 'cur', !!tr.counter.current, 'cal', JSON.stringify(tr.calibrator && tr.calibrator.baseline));
}
