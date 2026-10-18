import fs from 'fs';
import { P, isMainJoint } from './lib/landmarks.js';
const s = JSON.parse(fs.readFileSync(process.argv[2]));
const AR = 0.75, dist = (a, b) => Math.hypot((a[0] - b[0]) * AR, a[1] - b[1]);
for (let i = 0; i < s.frames.length; i += +(process.argv[3] || 8)) {
  const fr = s.frames[i]; if (!fr.pts) { console.log(i, 'none'); continue; }
  const p = fr.pts, t = fr.truth;
  const gtIn = t ? [...Array(33).keys()].filter(k => isMainJoint(k) && t[k][0] >= 0 && t[k][0] <= 1 && t[k][1] >= 0 && t[k][1] <= 1).length : 0;
  const mid = (a, b) => [(p[a][0] + p[b][0]) / 2, (p[a][1] + p[b][1]) / 2];
  const sc = mid(P.LEFT_SHOULDER, P.RIGHT_SHOULDER), hc = mid(P.LEFT_HIP, P.RIGHT_HIP);
  const sw = dist(p[P.LEFT_SHOULDER], p[P.RIGHT_SHOULDER]), torso = dist(sc, hc), hw = dist(p[P.LEFT_HIP], p[P.RIGHT_HIP]);
  const ear = dist(p[P.LEFT_EAR], p[P.RIGHT_EAR]), eye = dist(p[P.LEFT_EYE], p[P.RIGHT_EYE]);
  const noseSc = dist(p[P.NOSE], sc);
  const bad = t ? [...Array(33).keys()].filter(k => p[k][3] >= 0.65 && p[k][0] >= 0 && p[k][0] <= 1 && p[k][1] >= 0 && p[k][1] <= 1 && dist(p[k], t[k]) > 0.1).length : 33;
  const f = x => x.toFixed(3);
  console.log(String(i).padStart(3), 'GT主要關節在畫面', String(gtIn).padStart(2), '| 錯位', String(bad).padStart(2), '| 肩寬', f(sw), '軀幹', f(torso), '髖寬', f(hw), '耳距', f(ear), '眼距', f(eye), '鼻-肩', f(noseSc), '| 軀幹/肩寬', f(torso / sw), '耳/肩', f(ear / sw), '| 髖在肩下', (hc[1] - sc[1]).toFixed(3));
}
