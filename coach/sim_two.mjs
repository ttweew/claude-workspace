// 試算：完成一下要「連續 2 格」站直（第 1 格站直先不算，下一格也站直才算），看哪幾下會變
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
import { RepCounter } from '/home/user/claude-workspace/js/analysis/reps.js';
const f = process.argv[2];
const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
function run(patch) {
  const orig = RepCounter.prototype.update;
  if (patch) RepCounter.prototype.update = function (pose, t) {
    // 這一格會完成一下、但上一格不是站直：把這一格當成「看不到」略過（不完成、不作廢）
    const v = pose ? this.config.metric(pose, this) : null;
    const standNow = v !== null && v >= this.config.up && pose.view.view !== null;
    const finishing = standNow && this.current && this.current.reachedDown;
    const ok = !finishing || this._prevStand;
    this._prevStand = standNow;
    if (!ok) return { reps: this.reps.length, state: this.state, value: v, prompt: null, promptKind: '', rep: null };
    return orig.call(this, pose, t);
  };
  const pl = new PosePipeline(), tr = new WorkoutTracker('squat'); tr.useBaseline(p.meta.calibration);
  for (const fr of p.frames) tr.update(pl.process(fr.raw, fr.t, W, H), fr.t);
  RepCounter.prototype.update = orig;
  return tr.items.map(r => ({ s: r.start, e: r.end, min: Math.round(r.min), d: r.depth }));
}
const a = run(false), b = run(true);
console.log(f, '改之前', a.length, '改之後', b.length);
for (const r of b) if (!a.some(x => Math.abs(x.s - r.s) < 0.3)) console.log('  多算到', r.s.toFixed(1) + '-' + r.e.toFixed(1) + 's', r.min, r.d);
for (const r of a) if (!b.some(x => Math.abs(x.s - r.s) < 0.3)) console.log('  不算了', r.s.toFixed(1) + '-' + r.e.toFixed(1) + 's', r.min, r.d);
for (const r of b) { const o = a.find(x => Math.abs(x.s - r.s) < 0.3); if (o && Math.abs(o.e - r.e) > 0.05) console.log('  結束時間', o.e.toFixed(2), '→', r.e.toFixed(2)); }
