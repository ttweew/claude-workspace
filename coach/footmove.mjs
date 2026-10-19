// 腳跟、腳尖、腳踝在畫面上的高度：蹲低時和「最近一次站直」比，往上移多少（以小腿長為 100%，正數是往上）
// 腳平踩在地上時，腳跟、腳尖應該都不動；看是哪個點在動
import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { P, clearerSide } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const [f, a = 0, b = 1e9] = process.argv.slice(2);
const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
const pl = new PosePipeline(); let base = null; const deep = [];
for (const fr of p.frames) {
  const t = fr.t / 1000; const pose = pl.process(fr.raw, fr.t, W, H);
  if (!pose || pose.view.view === 'front' || t < +a || t > +b) { if (!pose) base = null; continue; }
  const s = clearerSide(pose.landmarks); const L = pose.landmarks; const y = k => L[P[s + '_' + k]].y * H, x = k => L[P[s + '_' + k]].x * W;
  const shank = Math.hypot(x('KNEE') - x('ANKLE'), y('KNEE') - y('ANKLE')); const knee = pose.angles[s + '_KNEE'];
  if (knee == null || shank < 1) continue;
  if (knee >= 165) base = { heel: y('HEEL'), toe: y('FOOT_INDEX'), ankle: y('ANKLE'), shank, s };
  else if (knee < 100 && base && base.s === s) deep.push({ heel: (base.heel - y('HEEL')) / base.shank * 100, toe: (base.toe - y('FOOT_INDEX')) / base.shank * 100, ankle: (base.ankle - y('ANKLE')) / base.shank * 100, shankRatio: shank / base.shank * 100 });
}
const q = (arr, k, x) => { const v = arr.map(o => o[k]).sort((u, w) => u - w); return v.length ? v[Math.floor((v.length - 1) * x)].toFixed(0) : '-'; };
console.log(`蹲低 ${deep.length} 格（和最近一次站直比，往上移 %小腿長）：腳跟 中位 ${q(deep, 'heel', .5)} [${q(deep, 'heel', .1)}~${q(deep, 'heel', .9)}]  腳尖 ${q(deep, 'toe', .5)} [${q(deep, 'toe', .1)}~${q(deep, 'toe', .9)}]  腳踝 ${q(deep, 'ankle', .5)}  小腿長變成 ${q(deep, 'shankRatio', .5)}%`);
