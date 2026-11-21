// 用法（在專案資料夾跑）：node vid_analyze.mjs <vidout 資料夾> [SCORE_SEEN]
// MediaPipe、YOLO 的每一格點換成網站的錄製檔，用網站的重播分析（js/data/replay-core.js）算伏地挺身：幾下、每一下手肘最低幾度、錯誤
// YOLO 的 17 點照 11/8 寫好的換法（parked/f3_movenet.patch 的 keypoints.js）換成 33 點：沒有的點放在附近、可信度 0
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const { parseRecording, analyzeRecording, ANGLE_KEYS } = await import(pathToFileURL(repo + '/js/data/replay-core.js'));
const { P, MIN_VISIBILITY } = await import(pathToFileURL(repo + '/js/skeleton/landmarks.js'));
const dir = process.argv[2], SCORE_SEEN = Number(process.argv[3] || 0.3);
const COCO = ['NOSE', 'LEFT_EYE', 'RIGHT_EYE', 'LEFT_EAR', 'RIGHT_EAR', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ELBOW', 'RIGHT_ELBOW',
  'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE'];
const NEAR = { LEFT_EYE_INNER: 'LEFT_EYE', LEFT_EYE_OUTER: 'LEFT_EYE', RIGHT_EYE_INNER: 'RIGHT_EYE', RIGHT_EYE_OUTER: 'RIGHT_EYE', MOUTH_LEFT: 'NOSE', MOUTH_RIGHT: 'NOSE',
  LEFT_PINKY: 'LEFT_WRIST', LEFT_INDEX: 'LEFT_WRIST', LEFT_THUMB: 'LEFT_WRIST', RIGHT_PINKY: 'RIGHT_WRIST', RIGHT_INDEX: 'RIGHT_WRIST', RIGHT_THUMB: 'RIGHT_WRIST',
  LEFT_HEEL: 'LEFT_ANKLE', LEFT_FOOT_INDEX: 'LEFT_ANKLE', RIGHT_HEEL: 'RIGHT_ANKLE', RIGHT_FOOT_INDEX: 'RIGHT_ANKLE' };
const vis = s => s < SCORE_SEEN ? s / SCORE_SEEN * MIN_VISIBILITY : MIN_VISIBILITY + (s - SCORE_SEEN) / (1 - SCORE_SEEN) * (1 - MIN_VISIBILITY);
function cocoTo33(k) {
  const by = {}; COCO.forEach((n, i) => { by[n] = [k[i][0], k[i][1], 0, vis(k[i][2])]; });
  const out = new Array(33);
  for (const [name, i] of Object.entries(P)) out[i] = by[name] || [...by[NEAR[name]].slice(0, 3), 0];
  return out;
}
const results = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(dir + '/' + f, 'utf8'));
  const [W, H] = d.size;
  const frames = d.frames.map(fr => ({ t: fr.t, landmarks: fr.r ? (Array.isArray(fr.r) ? fr.r : cocoTo33(fr.r.k)) : null, world: null }));
  const rec = { format: 'ai-sport-pose', meta: { videoWidth: W, videoHeight: H, workout: 'pushup' }, frames };
  const res = await analyzeRecording(parseRecording(JSON.stringify(rec)), W, H, { workout: 'pushup' });
  const name = f.replace('.json', '');
  results[name] = { res, frames };
  const reps = res.reps.map(r => ({ start: +r.start.toFixed(2), min: r.min !== undefined ? Math.round(r.min) : r.minAngle, errors: r.errors || r.faults || [] }));
  console.log(`${name.padEnd(26)} 數到 ${res.reps.length} 下 ` + JSON.stringify(res.reps.map(r => Object.fromEntries(Object.entries(r).filter(([k, v]) => typeof v !== 'object' || Array.isArray(v)).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])))).slice(0, 700));
}
// 每一格的手肘、髖角度：YOLO 和 MediaPipe lite 差多少（看得到的那一側）
const A = ANGLE_KEYS.length;
const ref = results['mediapipe-lite'].res;
for (const [name, { res }] of Object.entries(results)) {
  if (name === 'mediapipe-lite') continue;
  for (const key of ['RIGHT_ELBOW', 'LEFT_ELBOW', 'RIGHT_HIP', 'LEFT_HIP', 'RIGHT_KNEE']) {
    const j = ANGLE_KEYS.indexOf(key); if (j < 0) continue;
    const diffs = [];
    for (let i = 0; i < res.n; i++) { const a = res.angles[i * A + j], b = ref.angles[i * A + j]; if (Number.isFinite(a) && Number.isFinite(b)) diffs.push(a - b); }
    if (!diffs.length) { console.log(`  ${name} ${key}: 沒有可以比的格`); continue; }
    const mean = diffs.reduce((s, x) => s + x, 0) / diffs.length, mad = diffs.reduce((s, x) => s + Math.abs(x), 0) / diffs.length;
    console.log(`  ${name.padEnd(24)} ${key.padEnd(12)} 和 MediaPipe lite 比：${diffs.length} 格，平均差 ${mean.toFixed(1)}°，平均絕對差 ${mad.toFixed(1)}°，最大 ${Math.max(...diffs.map(Math.abs)).toFixed(1)}°`);
  }
}
// 近的一側 vs 遠的一側：可信度（YOLO 的分數、MediaPipe 的 visibility）
for (const [name, { frames }] of Object.entries(results)) {
  const avg = ids => { let s = 0, n = 0; for (const fr of frames) if (fr.landmarks) for (const i of ids) { s += fr.landmarks[i][3]; n++; } return n ? (s / n).toFixed(2) : '-'; };
  const side = s => ['SHOULDER', 'ELBOW', 'WRIST', 'HIP', 'KNEE', 'ANKLE'].map(p => P[s + '_' + p]);
  console.log(`  ${name.padEnd(24)} 可見度平均：右側 ${avg(side('RIGHT'))}、左側 ${avg(side('LEFT'))}（MIN_VISIBILITY ${MIN_VISIBILITY}）`);
}
