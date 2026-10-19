// 教練影片（網站對著螢幕錄的 JSON）：用重播同一套算法重算，列出每一下、錯誤、拍攝方向、每秒摘要
import { readFileSync, writeFileSync } from 'fs';
import { parseRecording, analyzeRecording, ANGLE_KEYS, VIEW_CODES } from '/home/user/claude-workspace/js/data/replay-core.js';
const f = process.argv[2], workout = process.argv[3] || 'squat';
const p = parseRecording(readFileSync(f, 'utf8'));
const W = p.meta.videoWidth, H = p.meta.videoHeight;
const r = await analyzeRecording(p, W, H, { workout });
const n = r.n, A = ANGLE_KEYS.length;
console.log('格數', n, '秒數', r.t[n - 1].toFixed(1), '大小', W, H, 'meta', JSON.stringify(p.meta.calibration));
const views = { side: 0, oblique: 0, front: 0, none: 0 };
for (let i = 0; i < n; i++) views[r.present[i] ? (VIEW_CODES[r.view[i]] || 'none') : 'none']++;
console.log('原始有人', (r.rawPresent.reduce((a, b) => a + b, 0) / n * 100).toFixed(1) + '%', '擋鬼點後有人', (r.present.reduce((a, b) => a + b, 0) / n * 100).toFixed(1) + '%', '方向', JSON.stringify(views));
console.log('次數', r.reps.length);
for (const it of r.reps) console.log(JSON.stringify(it));
// 每秒摘要：有人比例、方向、左右膝最小角度、左右髖最小
const ki = ANGLE_KEYS.indexOf('LEFT_KNEE'), kj = ANGLE_KEYS.indexOf('RIGHT_KNEE'), hi = ANGLE_KEYS.indexOf('LEFT_HIP'), hj = ANGLE_KEYS.indexOf('RIGHT_HIP');
const rows = [];
let sec = 0, buf = [];
const flush = () => {
  if (!buf.length) return;
  const pres = buf.filter(i => r.present[i]).length / buf.length;
  const vc = {}; buf.forEach(i => { const v = r.present[i] ? (VIEW_CODES[r.view[i]] || '-') : 'x'; vc[v] = (vc[v] || 0) + 1; });
  const mn = j => { const v = buf.map(i => r.angles[i * A + j]).filter(Number.isFinite); return v.length ? Math.round(Math.min(...v)) : '-'; };
  const mx = j => { const v = buf.map(i => r.angles[i * A + j]).filter(Number.isFinite); return v.length ? Math.round(Math.max(...v)) : '-'; };
  const fc = {}; buf.forEach(i => { if (r.present[i]) fc[r.facing[i]] = (fc[r.facing[i]] || 0) + 1; });
  rows.push(`${String(sec).padStart(3)}s 人${(pres * 100).toFixed(0).padStart(3)}% 方向${JSON.stringify(vc)} 面向${JSON.stringify(fc)} 左膝${mn(ki)}-${mx(ki)} 右膝${mn(kj)}-${mx(kj)} 左髖${mn(hi)}-${mx(hi)} 右髖${mn(hj)}-${mx(hj)}`);
};
for (let i = 0; i < n; i++) { const s = Math.floor(r.t[i]); if (s !== sec) { flush(); sec = s; buf = []; } buf.push(i); }
flush();
writeFileSync(process.argv[4] || 'seconds.txt', rows.join('\n'));
const dt = []; for (let i = 1; i < n; i++) dt.push((r.t[i] - r.t[i - 1]) * 1000); dt.sort((a, b) => a - b);
console.log('每格間隔 ms 中位', dt[dt.length >> 1].toFixed(0), '最大', dt[dt.length - 1].toFixed(0));
