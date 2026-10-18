// 畫面上的提示會不會亂跳：各種拍攝角度 × 雜訊，統計每分鐘切換次數
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { framingAdvice, FramingHint } from '/home/user/claude-workspace/js/analysis/framing.js';
import { clearerSide } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
import { SquatCounter } from '/home/user/claude-workspace/js/analysis/squat.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const depths = Array.from({ length: 12 }, (_, i) => [80, 95, 120, 88][i % 4]);
console.log('角度 雜訊 | 每分鐘切換：站位提示／儀表板左右／拍攝方向／深蹲提示 | 深蹲次數（應為 12） | 最常見的拍攝方向');
for (const noise of [1.5, 3, 5]) for (const yaw of [0, 15, 30, 45, 60, 75, 90]) {
  const rec = makeDemoRecording({ yaw, noisePx: noise, depths, seed: 11 });
  const pipe = new PosePipeline(), hint = new FramingHint(), squat = new SquatCounter();
  let side = 'LEFT', last = { hint: null, side: null, view: null, prompt: undefined }, sw = { hint: 0, side: 0, view: 0, prompt: 0 };
  const views = {};
  for (const f of rec.frames) {
    const raw = f.landmarks ? f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
    const p = pipe.process(raw, f.t, 640, 480);
    const r = squat.update(p, f.t);
    const h = p ? hint.update(framingAdvice(p.landmarks), f.t).text : '沒有人';
    if (p) side = clearerSide(p.landmarks, side);
    const v = p ? p.view.view : null;
    views[v] = (views[v] || 0) + 1;
    const cur = { hint: h, side, view: v, prompt: r.prompt };
    for (const k of Object.keys(sw)) { if (last[k] !== null && last[k] !== undefined && last[k] !== cur[k]) sw[k]++; last[k] = cur[k]; }
  }
  const min = rec.frames[rec.frames.length - 1].t / 60000;
  const top = Object.entries(views).sort((a, b) => b[1] - a[1])[0][0];
  console.log(`${String(yaw).padStart(2)}° ${noise} | ${['hint', 'side', 'view', 'prompt'].map(k => (sw[k] / min).toFixed(1)).join('／')} | ${squat.reps.length} | ${top}`);
}
