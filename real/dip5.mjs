import { readFileSync } from 'fs';
import { parseRecording, analyzeRecording, ANGLE_KEYS } from '/home/user/claude-workspace/js/data/replay-core.js';
const p = parseRecording(readFileSync(process.argv[2],'utf8'));
const r = await analyzeRecording(p, 480, 640, { lab: true });
const A = ANGLE_KEYS.length, j = ANGLE_KEYS.indexOf('LEFT_KNEE');
let line=[];
for (let i=0;i<r.n;i++){ const t=r.t[i]; if (t<241.5||t>262) continue; if (i%6) continue; const k=r.angles[i*A+j]; line.push(t.toFixed(1)+':'+(Number.isFinite(k)?Math.round(k):'-')); }
console.log(line.join(' '));
