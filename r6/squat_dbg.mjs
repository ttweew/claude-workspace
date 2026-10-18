// 畫面上的提示會不會亂跳：各種拍攝角度 × 雜訊，統計每分鐘切換次數
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { framingAdvice, FramingHint } from '/home/user/claude-workspace/js/analysis/framing.js';
import { clearerSide } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
import { SquatCounter } from '/home/user/claude-workspace/js/analysis/squat.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const depths = Array.from({ length: 12 }, (_, i) => [80, 95, 120, 88][i % 4]);
console.log('角度 雜訊 | 每分鐘切換：站位提示／儀表板左右／拍攝方向／深蹲提示 | 深蹲次數（應為 12） | 最常見的拍攝方向');
let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const BURST = Number(process.argv[2] || 0.03);
for (const noise of [1.5]) for (const yaw of [30]) {
  const rec = makeDemoRecording({ yaw, noisePx: noise, depths, seed: 11 });
  const pipe = new PosePipeline(), hint = new FramingHint(), squat = new SquatCounter();
  let side = 'LEFT', last = { hint: null, side: null, view: null, prompt: undefined }, sw = { hint: 0, side: 0, view: 0, prompt: 0 };
  const views = {};
  for (const f of rec.frames) {
    const raw = f.landmarks ? f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
    // 爆發性雜訊：每格有 BURST 的機率，隨機 1～3 個關節跳開 20～60 像素、或可信度掉到 0.3
    if (raw && rnd() < BURST) for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
      const j = 11 + Math.floor(rnd() * 18), q = raw[j];
      if (rnd() < 0.5) { const a = rnd() * 6.28, d = (20 + rnd() * 40); q.x += Math.cos(a) * d / 640; q.y += Math.sin(a) * d / 480; }
      else q.visibility = 0.3;
    }
    const p = pipe.process(raw, f.t, 640, 480);
    const before = squat.state;
    const r = squat.update(p, f.t);
    if (p && p.view.view !== globalThis.__lv) { console.log((f.t/1000).toFixed(2) + 's 拍攝方向', globalThis.__lv, '→', p.view.view, '比值', p.view.ratio && p.view.ratio.toFixed(2), '深蹲狀態', before, '→', squat.state); globalThis.__lv = p.view.view; }
    if (r.rep) console.log((f.t/1000).toFixed(2) + 's 第', r.rep.n, '下');
    const h = hint.update(p ? framingAdvice(p.landmarks) : { text: '未偵測到人體', kind: 'warn' }, f.t).text;
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
