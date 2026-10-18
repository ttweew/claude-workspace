import fs from 'fs';
import { LANDMARKS } from './lib/landmarks.js';
const [n, conf, fi] = process.argv.slice(2);
const s = JSON.parse(fs.readFileSync(`seq_${n}_c${conf}.json`)); const fr = s.frames[+fi];
fr.pts.forEach((p, i) => { const t = fr.truth[i]; const d = Math.hypot((p[0]-t[0])*0.75, p[1]-t[1]); console.log(i, LANDMARKS[i][1].padEnd(6), 'pred', p[0], p[1], 'vis', p[3], '| truth', t[0], t[1], 'gtvis', t[2].toFixed(2), '| d', d.toFixed(3)); });
