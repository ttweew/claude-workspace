// 棒式錄製檔：每 0.5 秒一行，看那時候網站畫面上的狀態（有沒有在計時、紅字是哪一種、腰彎幾度、髖角度）
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';
import { clearerSide } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const p = parseRecording(readFileSync(process.argv[2], 'utf8'));
const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(), tr = new WorkoutTracker('plank');
let next = 0, shown = {};
for (const fr of p.frames) {
  const pose = pl.process(fr.raw, fr.t, W, H);
  const r = tr.update(pose, fr.t);
  const errs = r.form.errors.map(e => e.id);
  errs.forEach(e => shown[e] = (shown[e] || 0) + 1);
  if (fr.t >= next) {
    const side = pose ? clearerSide(pose.landmarks) : null;
    const hip = pose ? pose.angles[side + '_HIP'] : null;
    const vals = Object.entries(r.form.values || {}).map(([k, v]) => k + Math.round(v)).join(' ');
    console.log((fr.t / 1000).toFixed(1).padStart(5) + 's', pose ? String(pose.view.view || '-').padEnd(7) : 'none   ', r.count.holding ? '計時中 ' + r.count.seconds.toFixed(1) : (r.count.prompt ? '提示：' + r.count.prompt.slice(0, 12) : '未計時'), '髖' + (hip == null ? '-' : Math.round(hip)), '紅字:' + (errs.join(',') || '-'), vals);
    next += 500;
  }
}
console.log('紅字出現的格數', JSON.stringify(shown), '紀錄', JSON.stringify(tr.counter.holds.concat(tr.counter.current ? [{ current: tr.counter.current.ms / 1000 }] : [])));
