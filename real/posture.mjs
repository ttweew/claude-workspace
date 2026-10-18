import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const W = d.meta.videoWidth, H = d.meta.videoHeight;
const sec = {};
for (const f of d.frames) { if (!f.landmarks) continue; const s = Math.floor(f.t / 1000); (sec[s] ||= []).push(f.landmarks); }
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const rows = [];
for (const [s, ls] of Object.entries(sec)) {
  const v = fn => med(ls.map(fn));
  const mid = (l, a, b) => [(l[a][0] + l[b][0]) / 2 * W, (l[a][1] + l[b][1]) / 2 * H];
  const tilt = v(l => { const sh = mid(l, 11, 12), hp = mid(l, 23, 24); return Math.atan2(Math.abs(hp[0] - sh[0]), hp[1] - sh[1]) * 180 / Math.PI; });
  const wristUp = v(l => Math.min(l[15][1], l[16][1]) < l[0][1] ? 1 : 0);
  const feetSpread = v(l => Math.abs(l[27][0] - l[28][0]) * W / (Math.abs(l[11][0] - l[12][0]) * W + 1e-6));
  const wristY = v(l => Math.max(l[15][1], l[16][1]));
  const yRange = [];
  for (const l of ls) yRange.push(l[0][1]);
  const bob = Math.max(...yRange) - Math.min(...yRange);
  rows.push(`${String(s).padStart(3)} 軀幹傾斜${tilt.toFixed(0).padStart(4)}° 手過頭${wristUp} 雙腳/肩寬${feetSpread.toFixed(1).padStart(5)} 手腕y${wristY.toFixed(2)} 鼻子上下${bob.toFixed(2)}`);
}
console.log(rows.join('\n'));
