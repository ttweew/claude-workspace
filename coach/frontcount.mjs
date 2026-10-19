// 試算：正面拍也計次（只數次數）：兩膝角度的平均「≥160 → ≤140 → ≥160」算一下；另外用髖部下降（以大腿＋小腿長為 1）數一次比較
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { P } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const [f, a, b] = process.argv.slice(2);
const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(); let st = 'wait', n = 0, min = 999; const reps = [];
for (const fr of p.frames) {
  const t = fr.t / 1000; const pose = pl.process(fr.raw, fr.t, W, H);
  if (t < +a || t > +b || !pose) continue;
  const ks = [pose.angles.LEFT_KNEE, pose.angles.RIGHT_KNEE].filter(x => x != null);
  if (!ks.length) continue;
  const k = ks.reduce((s, x) => s + x, 0) / ks.length;
  if (k >= 160) { if (st === 'squat') { n++; reps.push(`${t.toFixed(1)}(${Math.round(min)})`); } st = 'stand'; min = 999; }
  else if (st !== 'wait') { min = Math.min(min, k); if (k <= 140) st = 'squat'; }
}
console.log(`${f} ${a}-${b}s 正面也計次：${n} 下`, reps.join(' '));
