// 伏地挺身示範影片（模型對照頁存的兩份錄製檔）：兩個模型每一格左右兩側的可信度、網站挑哪一側、兩側的手肘角度
import { readFileSync } from 'node:fs';
import { P, clearerSide } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const dir = process.argv[2];
const load = f => JSON.parse(readFileSync(dir + '/' + f, 'utf8'));
const ang = (a, b, c) => {
  const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
  const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
};
for (const f of ['rec_A.json', 'rec_B.json']) {
  const d = load(f);
  const W = d.meta.videoWidth, H = d.meta.videoHeight;
  let side = 'LEFT';
  const stats = { LEFT: 0, RIGHT: 0 };
  const visL = [], visR = [];
  const rows = [];
  for (const fr of d.frames) {
    if (!fr.landmarks) continue;
    const lm = fr.landmarks.map(([x, y, z, v]) => ({ x: x * W, y: y * H, visibility: v }));
    side = clearerSide(lm, side);
    stats[side]++;
    const s = k => ['SHOULDER', 'HIP', 'KNEE', 'ANKLE'].reduce((a, j) => a + lm[P[k + '_' + j]].visibility, 0);
    visL.push(s('LEFT')); visR.push(s('RIGHT'));
    const el = k => ang(lm[P[k + '_SHOULDER']], lm[P[k + '_ELBOW']], lm[P[k + '_WRIST']]);
    rows.push({ t: fr.t, L: el('LEFT'), R: el('RIGHT'), side, nose: lm[P.NOSE].x, hip: (lm[P.LEFT_HIP].x + lm[P.RIGHT_HIP].x) / 2 });
  }
  const mean = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  console.log(f, d.meta.model, 'frames', rows.length, '挑的側', JSON.stringify(stats), '可信度加總 平均 L', mean(visL), 'R', mean(visR),
    '鼻子在髖的', rows.filter(r => r.nose > r.hip).length > rows.length / 2 ? '右邊（面向右）' : '左邊（面向左）');
  // 每 0.5 秒列一次
  console.log(rows.filter((r, i) => i % 15 === 0).map(r => r.t + 'ms L' + r.L.toFixed(0) + ' R' + r.R.toFixed(0) + ' 用' + r.side[0]).join(' | '));
  console.log('手肘最小：L', Math.min(...rows.map(r => r.L)).toFixed(0), 'R', Math.min(...rows.map(r => r.R)).toFixed(0));
}
