// 試算：每一下中途停頓幾次（下去、起來的途中速度掉到很低又加速）
import { readFileSync } from 'fs';
const sets = JSON.parse(readFileSync('reps.json', 'utf8'));
const LOW = +process.argv[2] || 0.2, HOLD = +process.argv[3] || 150, EDGE = +process.argv[4] || 0.15;
function hesitations(s) {
  // s: [[t ms, v deg]]；速度：前後各 1 格的差（度/秒）
  const pts = s.map(([t, v]) => ({ t, v }));
  if (pts.length < 6) return { n: 0, list: [] };
  let bi = 0; pts.forEach((p, i) => { if (p.v < pts[bi].v) bi = i; });
  const speed = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; return b.t > a.t ? Math.abs(b.v - a.v) / (b.t - a.t) * 1000 : 0; });
  const res = [];
  for (const [from, to] of [[0, bi], [bi, pts.length - 1]]) {
    const top = Math.max(pts[from].v, pts[to].v), low = pts[bi].v, range = top - low;
    if (range < 20 || to - from < 4) continue;
    const peak = Math.max(...speed.slice(from, to + 1));
    let since = null, moved = false;
    for (let i = from; i <= to; i++) {
      const frac = (pts[i].v - low) / range;          // 0 在最低、1 在最高
      const inside = frac > EDGE && frac < 1 - EDGE;    // 不看最高、最低附近（本來就會慢下來轉向）
      if (inside && speed[i] < peak * LOW) { if (since === null) since = pts[i].t; }
      else { if (since !== null && pts[i].t - since >= HOLD && inside) res.push({ at: since, ms: pts[i].t - since }); since = null; }
    }
  }
  return { n: res.length, list: res };
}
let tot = 0, flagged = 0;
for (const set of sets) {
  const hs = set.reps.map(r => r.s ? hesitations(r.s).n : -1);
  const durs = set.reps.map(r => r.end - r.start);
  const m = durs.reduce((a, b) => a + b, 0) / durs.length, sd = Math.sqrt(durs.reduce((a, d) => a + (d - m) ** 2, 0) / durs.length);
  tot += hs.length; flagged += hs.filter(x => x > 0).length;
  console.log(set.name.padEnd(32), 'stops', hs.join(','), '| CV', (sd / m * 100).toFixed(0) + '%');
}
console.log('reps', tot, 'flagged', flagged, 'LOW', LOW, 'HOLD', HOLD, 'EDGE', EDGE);
