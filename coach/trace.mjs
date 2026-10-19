// 逐格追蹤計次狀態：狀態一變就印出來（時間、角度、方向、提示）
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
const [f, workout, from, to] = process.argv.slice(2);
const p = parseRecording(readFileSync(f, 'utf8'));
const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(), tr = new WorkoutTracker(workout);
tr.useBaseline(p.meta.calibration);
let last = '';
for (const fr of p.frames) {
  const pose = pl.process(fr.raw, fr.t, W, H);
  const o = tr.update(pose, fr.t);
  const s = fr.t / 1000;
  if (s < +from || s > +to) continue;
  const c = o.count || {};
  const key = [c.state, c.prompt, pose ? pose.view.view : 'none', (o.form && o.form.errors || []).map(e => e.id).join('+')].join('|');
  if (key !== last || c.rep) {
    console.log(s.toFixed(2), 'state', c.state, 'v', c.value == null ? '-' : Math.round(c.value), 'view', pose ? pose.view.view : 'none', 'reps', c.reps, c.prompt ? '提示:' + c.prompt : '', c.rep ? 'REP #' + c.rep.n + ' min ' + Math.round(c.rep.min) : '', (o.form && o.form.errors || []).map(e => e.id).join('+'));
    last = key;
  }
}
