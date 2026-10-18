import fs from 'fs';
import { PoseSmoother } from './real/smooth.js';
import { GhostFilter } from './real/ghost.js';
import { isVisible, isMainJoint, P, MIN_VISIBILITY } from './real/landmarks.js';
const toLm = pts => pts.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
const AR = 480 / 640;
const SWAP = Array.from({ length: 33 }, (_, i) => i);
for (let i = 0; i < 33; i++) { const k = Object.keys(P).find(k => P[k] === i); const o = k.startsWith('LEFT_') ? 'RIGHT_' + k.slice(5) : k.startsWith('RIGHT_') ? 'LEFT_' + k.slice(6) : k; SWAP[i] = P[o]; }
function run(seq, useGhost) {
  const sm = new PoseSmoother(), gf = new GhostFilter();
  let frames = 0, bad = 0, badFrames = 0, miss = 0, truthMain = 0, toggles = 0, prev = null;
  const d = (p, t) => Math.hypot((p.x - t[0]) * AR, p.y - t[1]);
  for (const fr of seq.frames) {
    frames++;
    let l = fr.pts ? sm.smooth(toLm(fr.pts), fr.t) : null, show = new Array(33).fill(false);
    if (l) { if (!useGhost) show = l.map(isVisible); else if (gf.update(l, fr.t, 480, 640)) show = l.map(isVisible); }
    else gf.reset();
    let b = 0;
    for (let i = 0; i < 33; i++) {
      const tin = fr.truth && fr.truth[i][2] >= 0.5 && fr.truth[i][0] >= 0.02 && fr.truth[i][0] <= 0.98 && fr.truth[i][1] >= 0.02 && fr.truth[i][1] <= 0.98;
      if (show[i] && (!fr.truth || Math.min(d(l[i], fr.truth[i]), d(l[i], fr.truth[SWAP[i]])) > 0.1)) b++;
      if (isMainJoint(i) && tin) { truthMain++; if (!show[i]) miss++; }
      if (prev && prev[i] !== show[i]) toggles++;
    }
    bad += b; if (b) badFrames++; prev = show;
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + '%';
  return [pct(badFrames, frames), (bad / frames).toFixed(2), pct(miss, truthMain), (toggles / (frames / 30)).toFixed(1)];
}
const tag = process.argv[2] || 'c0.5';
console.log('情境       | 有錯位點的格 | 錯位點/格 | 漏畫主要關節 | 閃爍/秒   （改前 → 改後）');
for (const n of ['walk', 'waistup', 'panout', 'empty', 'dark', 'close']) {
  const seq = JSON.parse(fs.readFileSync(`seq_${n}_${tag}.json`));
  const a = run(seq, false), b = run(seq, true);
  console.log(n.padEnd(10), '|', a.map((x, i) => `${x} → ${b[i]}`).join(' | '));
}
