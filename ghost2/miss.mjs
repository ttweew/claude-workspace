import fs from 'fs';
import { PoseSmoother } from './real/smooth.js';
import { GhostFilter } from './real/ghost.js';
import { isVisible, isMainJoint, LANDMARKS } from './real/landmarks.js';
const seq = JSON.parse(fs.readFileSync(process.argv[2]));
const sm = new PoseSmoother(), gf = new GhostFilter(); const cnt = {}; const frs = {};
seq.frames.forEach((fr, k) => {
  const l = sm.smooth(fr.pts.map(([x, y, z, visibility]) => ({ x, y, z, visibility })), fr.t);
  const ok = gf.update(l, fr.t, 480, 640);
  for (let i = 0; i < 33; i++) { const t = fr.truth[i]; const tin = t[2] >= 0.5 && t[0] >= 0.02 && t[0] <= 0.98 && t[1] >= 0.02 && t[1] <= 0.98;
    if (isMainJoint(i) && tin && !(ok && isVisible(l[i])) && k > 4) { cnt[i] = (cnt[i] || 0) + 1; (frs[i] = frs[i] || []).push(k + ':' + fr.pts[i][3] + (ok ? '' : 'G')); } }
});
for (const i in cnt) console.log(LANDMARKS[i][1], cnt[i], frs[i].slice(0, 12).join(' '));
