// 某一段時間每一格：計次狀態、看的角度、身體傾斜、方向、髖、膝（找多算的那一下是什麼動作）
// 用法：node trace_win.mjs <錄製檔> <動作> <開始秒> <結束秒>
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
import { bodyTilt } from '/home/user/claude-workspace/js/analysis/reps.js';
import { clearerSide } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const [f, w, a, b] = process.argv.slice(2);
const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(), tr = new WorkoutTracker(w);
if (p.meta.calibration) tr.useBaseline(p.meta.calibration);
for (const fr of p.frames) {
  const pose = pl.process(fr.raw, fr.t, W, H);
  const r = tr.update(pose, fr.t);
  const t = fr.t / 1000;
  if (t < +a || t > +b) continue;
  const side = pose ? clearerSide(pose.landmarks) : null;
  const ang = k => pose && pose.angles[side + '_' + k] != null ? Math.round(pose.angles[side + '_' + k]) : '-';
  const tilt = pose ? bodyTilt(pose.landmarks, W, H) : null;
  console.log(t.toFixed(2), pose ? String(pose.view.view) : 'none', 'facing', pose ? pose.view.facing : '-', 'state', r.count && r.count.state, 'val', r.count && r.count.value != null ? Math.round(r.count.value) : '-',
    'tilt', tilt == null ? '-' : Math.round(tilt), 'hip', ang('HIP'), 'knee', ang('KNEE'), 'elbow', ang('ELBOW'), r.done ? '<< 完成 ' + JSON.stringify({ n: r.done.n, min: Math.round(r.done.min), depth: r.done.depth }) : '');
}
