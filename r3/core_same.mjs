// 正常檔案：新舊讀檔＋分析的結果要完全相同（JSON、CSV、含 NaN z、沒偵測到人的格子）
import * as O from './core_old_link.js';
import * as N from '/home/user/claude-workspace/js/data/replay-core.js';
import { PoseRecorder } from '/home/user/claude-workspace/js/data/recorder.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { readFileSync } from 'fs';
const demo = makeDemoRecording({ yaw: 30, noisePx: 2 });
const r = new PoseRecorder(); r.start({ videoWidth: 640, videoHeight: 480 });
demo.frames.forEach((f, i) => {
  const lm = i % 37 === 5 ? null : f.landmarks.map(([x, y, z, v], j) => ({ x, y, z: j === 3 && i % 11 === 0 ? NaN : z, visibility: v }));
  r.add(f.t, lm, lm ? lm.map(p => ({ x: p.x, y: p.y, z: 0 })) : null);
});
const files = { json: r.toJSON(), csv: r.toCSV(), demo: JSON.stringify(demo) };
try { files.real = readFileSync('/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/hunt/long.json', 'utf8'); } catch (e) {}
let all = true;
for (const [name, text] of Object.entries(files)) {
  const a = await O.analyzeRecording(O.parseRecording(text), 640, 480, { lab: true });
  const b = await N.analyzeRecording(N.parseRecording(text), 640, 480, { lab: true });
  let same = JSON.stringify(a.reps) === JSON.stringify(b.reps);
  for (const k of ['t', 'present', 'angles', 'signed', 'rawAngles', 'view', 'ratio', 'facing', 'smooth', 'smoothVis', 'rawPresent', 'raw', 'rawVis']) {
    const x = a[k], y = b[k];
    for (let i = 0; i < x.length; i++) if (!(x[i] === y[i] || (Number.isNaN(x[i]) && Number.isNaN(y[i])))) { same = false; console.log(name, k, i, x[i], y[i]); break; }
  }
  console.log(name, '格數', a.n, '相同', same); all = all && same;
}
console.log(all ? '全部相同' : '有差異');
