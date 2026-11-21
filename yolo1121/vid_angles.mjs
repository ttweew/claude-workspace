// 每個模型：撐在上面（每一輪第 3～10 格）和最低點（第 36～43 格，MediaPipe 手肘最小的那幾格）的右肘、右髖、右膝角度中位數（網站的重播分析算的）
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const { parseRecording, analyzeRecording, ANGLE_KEYS } = await import(pathToFileURL(repo + '/js/data/replay-core.js'));
const { P, MIN_VISIBILITY } = await import(pathToFileURL(repo + '/js/skeleton/landmarks.js'));
const dir = process.argv[2];
const COCO = ['NOSE','LEFT_EYE','RIGHT_EYE','LEFT_EAR','RIGHT_EAR','LEFT_SHOULDER','RIGHT_SHOULDER','LEFT_ELBOW','RIGHT_ELBOW','LEFT_WRIST','RIGHT_WRIST','LEFT_HIP','RIGHT_HIP','LEFT_KNEE','RIGHT_KNEE','LEFT_ANKLE','RIGHT_ANKLE'];
const NEAR = { LEFT_EYE_INNER:'LEFT_EYE', LEFT_EYE_OUTER:'LEFT_EYE', RIGHT_EYE_INNER:'RIGHT_EYE', RIGHT_EYE_OUTER:'RIGHT_EYE', MOUTH_LEFT:'NOSE', MOUTH_RIGHT:'NOSE', LEFT_PINKY:'LEFT_WRIST', LEFT_INDEX:'LEFT_WRIST', LEFT_THUMB:'LEFT_WRIST', RIGHT_PINKY:'RIGHT_WRIST', RIGHT_INDEX:'RIGHT_WRIST', RIGHT_THUMB:'RIGHT_WRIST', LEFT_HEEL:'LEFT_ANKLE', LEFT_FOOT_INDEX:'LEFT_ANKLE', RIGHT_HEEL:'RIGHT_ANKLE', RIGHT_FOOT_INDEX:'RIGHT_ANKLE' };
const vis = s => s < 0.3 ? s / 0.3 * MIN_VISIBILITY : MIN_VISIBILITY + (s - 0.3) / 0.7 * (1 - MIN_VISIBILITY);
const to33 = k => { const by = {}; COCO.forEach((n, i) => { by[n] = [k[i][0], k[i][1], 0, vis(k[i][2])]; }); const o = new Array(33); for (const [n, i] of Object.entries(P)) o[i] = by[n] || [...by[NEAR[n]].slice(0, 3), 0]; return o; };
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)].toFixed(0) : '-'; };
const A = ANGLE_KEYS.length;
console.log('模型'.padEnd(28), '撐在上面：肘 髖 膝'.padEnd(22), '最低點：肘 髖 膝');
for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(dir + '/' + f, 'utf8')); const [W, H] = d.size;
  const frames = d.frames.map(fr => ({ t: fr.t, landmarks: fr.r ? (Array.isArray(fr.r) ? fr.r : to33(fr.r.k)) : null, world: null }));
  const res = await analyzeRecording(parseRecording(JSON.stringify({ format: 'ai-sport-pose', meta: { videoWidth: W, videoHeight: H }, frames })), W, H, { workout: 'pushup' });
  const pick = (from, to, key) => { const j = ANGLE_KEYS.indexOf(key), v = []; for (let i = 0; i < res.n; i++) { const fi = i % 60; if (fi >= from && fi <= to) v.push(res.angles[i * A + j]); } return med(v); };
  const up = ['RIGHT_ELBOW', 'RIGHT_HIP', 'RIGHT_KNEE'].map(k => pick(3, 10, k)).join(' ');
  const dn = ['RIGHT_ELBOW', 'RIGHT_HIP', 'RIGHT_KNEE'].map(k => pick(36, 43, k)).join(' ');
  console.log(f.replace('.json', '').padEnd(28), up.padEnd(22), dn);
}
