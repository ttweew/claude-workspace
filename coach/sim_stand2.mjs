// 試算：正面拍的格子裡如果「站直」（膝 ≥ 160），也記成站直（只改狀態，不開始新的一下、不更新最低角度）
// 比較改之前、改之後各算到幾下，列出多算到的那幾下
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
    const prev = this.state;
    const o = orig.call(this, pose, t);
    // 正面拍：沒有進行中的一下時，站直就記成站直；本來是站直、還沒看到蹲下去（正面不量深度）就維持站直
    if (pose && pose.view.view === 'front' && o.value !== null && !this.current) {
      if (o.value >= this.config.up) { this.state = 'stand'; this.lastTop = { t, v: o.value }; }
      else if (prev === "stand" && o.value > this.config.down) this.state = "stand";
      o.state = this.state;
    }
    return o;
  };
  const pl = new PosePipeline(), tr = new WorkoutTracker('squat'); tr.useBaseline(p.meta.calibration);
  for (const fr of p.frames) tr.update(pl.process(fr.raw, fr.t, W, H), fr.t);
  RepCounter.prototype.update = orig;
  return tr.items.map(r => ({ s: r.start, e: r.end, min: Math.round(r.min), d: r.depth }));
}
const a = run(false), b = run(true);
console.log(f, '改之前', a.length, '改之後', b.length);
for (const r of b) if (!a.some(x => Math.abs(x.s - r.s) < 0.3)) console.log('  多算到', r.s.toFixed(1) + '-' + r.e.toFixed(1) + 's', '最低膝', r.min, r.d);
for (const r of a) if (!b.some(x => Math.abs(x.s - r.s) < 0.3)) console.log('  少算', r.s.toFixed(1), r.e.toFixed(1));
