// 某一段時間每 0.2 秒印一次：膝蓋角度、拍攝方向、計次狀態（舊程式和改好的程式各一行）
import { readFileSync } from 'fs';
const [f, from, to] = process.argv.slice(2);
async function run(root) {
  const { parseRecording } = await import(root + '/js/data/replay-core.js');
  const { PosePipeline } = await import(root + '/js/skeleton/pipeline.js');
  const { WorkoutTracker } = await import(root + '/js/analysis/tracker.js');
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(), tr = new WorkoutTracker('squat'); tr.useBaseline(p.meta.calibration);
  const out = []; let next = +from;
  for (const fr of p.frames) {
    const pose = pl.process(fr.raw, fr.t, W, H); const o = tr.update(pose, fr.t); const s = fr.t / 1000;
    if (s >= next && s <= +to) { const c = o.count || {}; out.push([s.toFixed(1), c.value == null ? '-' : Math.round(c.value), pose && pose.view && pose.view.view ? pose.view.view[0] : 'x', (c.state || '-').slice(0, 4), c.reps]); next = s + 0.2; }
  }
  return out;
}
const a = await run('/home/user/claude-workspace'), b = await run('/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-maint');
for (let i = 0; i < a.length; i++) console.log(a[i].join(' '), ' | ', b[i] ? b[i].slice(3).join(' ') : '');
