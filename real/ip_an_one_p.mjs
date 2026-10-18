import { readFileSync } from 'fs';
import { parseRecording, analyzeRecording, ANGLE_KEYS, VIEW_CODES, WORLD_BONES, WORLD_KNEES } from '/home/user/claude-workspace/js/data/replay-core.js';
const U='/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/ipad_zip/';
const files = { L: [process.argv[2], process.argv[2]] };
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : NaN; };
for (const [name, [jf, cf]] of Object.entries(files)) {
  const pj = parseRecording(readFileSync(U + jf, 'utf8'));
  const r = await analyzeRecording(pj, 480, 640, { lab: true });
  const rc = await analyzeRecording(parseRecording(readFileSync(U + cf, 'utf8')), 480, 640, { lab: true });
  let same = true; for (let i = 0; i < r.angles.length; i++) { const a = r.angles[i], b = rc.angles[i]; if (!(a === b || (isNaN(a) && isNaN(b)) || Math.abs(a - b) < 0.05)) { same = false; break; } }
  const n = r.n, A = ANGLE_KEYS.length;
  const dt = []; for (let i = 1; i < n; i++) dt.push((r.t[i] - r.t[i - 1]) * 1000);
  const views = { side: 0, oblique: 0, front: 0, none: 0 };
  for (let i = 0; i < n; i++) views[r.present[i] ? (VIEW_CODES[r.view[i]] || 'none') : 'none']++;
  console.log(`\n==== 錄影 ${name}：${n} 格、${r.t[n - 1].toFixed(1)} 秒；JSON 與 CSV 結果相同：${same}`);
  console.log('每格間隔 ms：中位', q(dt, .5).toFixed(0), '90%', q(dt, .9).toFixed(0), '最大', Math.max(...dt).toFixed(0), '→ 約', (1000 / q(dt, .5)).toFixed(1), 'fps');
  console.log('有人（原始）', (r.rawPresent.reduce((a, b) => a + b, 0) / n * 100).toFixed(0) + '%', '畫面上有骨架', (r.present.reduce((a, b) => a + b, 0) / n * 100).toFixed(0) + '%');
  console.log('拍攝方向（格數）', views);
  for (const [j, k] of ANGLE_KEYS.entries()) {
    const v = [], raw = []; for (let i = 0; i < n; i++) { v.push(r.angles[i * A + j]); raw.push(r.rawAngles[i * A + j]); }
    const step = arr => { let s = 0, c = 0; for (let i = 1; i < arr.length; i++) if (Number.isFinite(arr[i]) && Number.isFinite(arr[i - 1])) { s += Math.abs(arr[i] - arr[i - 1]); c++; } return c ? s / c : NaN; };
    console.log(k.padEnd(12), '有角度', (v.filter(Number.isFinite).length / n * 100).toFixed(0).padStart(3) + '%', '最小', q(v, 0).toFixed(0), '10%', q(v, .1).toFixed(0), '中位', q(v, .5).toFixed(0), '最大', q(v, 1).toFixed(0), '抖動', step(v).toFixed(2), '原始抖動', step(raw).toFixed(2));
  }
  console.log('深蹲（實驗功能）次數', r.reps.length, r.reps.map(x => `#${x.n} ${x.start.toFixed(1)}-${x.end.toFixed(1)}s 最低膝${x.minKnee.toFixed(0)}° ${x.depth}${x.oblique ? '(斜)' : ''}`).join(' | '));
  const B = WORLD_BONES.length;
  for (const [k, [key, nm]] of WORLD_BONES.entries()) {
    const raw = [], st = []; for (let i = 0; i < n; i++) { raw.push(r.boneRaw[i * B + k] * 100); st.push(r.boneStable[i * B + k] * 100); }
    console.log(nm, '原始 中位', q(raw, .5).toFixed(1), '變動±', ((q(raw, .9) - q(raw, .1)) / 2).toFixed(1), '| 處理過 中位', q(st, .5).toFixed(1), '變動±', ((q(st, .9) - q(st, .1)) / 2).toFixed(1), '格數', raw.filter(Number.isFinite).length);
  }
}
