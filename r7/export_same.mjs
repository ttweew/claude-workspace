// 新的匯出：原本的欄位要和舊版逐字相同；重播讀新檔案的結果要和讀舊檔案相同
import { PoseRecorder as Old } from './recorder_old.mjs';
import { PoseRecorder as New } from '/home/user/claude-workspace/js/data/recorder.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { parseRecording, analyzeRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const demo = makeDemoRecording({ yaw: 10, noisePx: 2 });
const a = new Old(), b = new New(), pipe = new PosePipeline();
a.start({ videoWidth: 640, videoHeight: 480 }); b.start({ videoWidth: 640, videoHeight: 480 }); b.meta = a.meta;
demo.frames.forEach((f, i) => {
  const raw = i % 41 === 7 ? null : f.landmarks.map(([x, y, z, v], j) => ({ x, y, z: j === 3 && i % 13 === 0 ? NaN : z, visibility: v }));
  const world = raw && i % 3 ? raw.map(p => ({ x: p.x / 3, y: p.y, z: p.z })) : null;
  const p = pipe.process(raw, f.t, 640, 480);
  a.add(f.t, raw, world); b.add(f.t, raw, world, p ? p.landmarks : null);
});
const oldCsv = a.toCSV().split('\r\n'), newCsv = b.toCSV().split('\r\n');
let csvSame = oldCsv.length === newCsv.length;
for (let i = 0; i < oldCsv.length && csvSame; i++) {
  const o = oldCsv[i].split(','), n = newCsv[i].split(',');
  if (o.length > 1 && (n.slice(0, o.length).join(',') !== o.join(',') || n.length !== o.length + 165 + 99)) { csvSame = false; console.log('第', i, '列不同', o.length, n.length); }
}
const oj = JSON.parse(a.toJSON()), nj = JSON.parse(b.toJSON());
const jsonSame = JSON.stringify(oj.frames.map(f => [f.t, f.landmarks, f.world])) === JSON.stringify(nj.frames.map(f => [f.t, f.landmarks, f.world]))
  && JSON.stringify(oj.meta) === JSON.stringify(nj.meta);
const withSmooth = nj.frames.filter(f => f.smoothed).length, seen = nj.frames.filter(f => f.smoothed).map(f => f.smoothed.filter(q => q[4] === 1).length);
console.log('CSV 原本 234 欄逐字相同、多 264 欄', csvSame, '| 欄數', newCsv[0].split(',').length);
console.log('JSON 原本的資料相同', jsonSame, '| 有平滑資料的格', withSmooth, '/', nj.frames.length, '| 每格畫出來的點數', Math.min(...seen), '～', Math.max(...seen));
// 重播：讀新舊檔案，結果相同
let replaySame = true;
for (const [name, oldText, newText] of [['JSON', a.toJSON(), b.toJSON()], ['CSV', a.toCSV(), b.toCSV()]]) {
  const r1 = await analyzeRecording(parseRecording(oldText), 640, 480, { lab: true });
  const r2 = await analyzeRecording(parseRecording(newText), 640, 480, { lab: true });
  for (const k of ['angles', 'smooth', 'raw', 'present']) for (let i = 0; i < r1[k].length; i++) if (!(r1[k][i] === r2[k][i] || (Number.isNaN(r1[k][i]) && Number.isNaN(r2[k][i])))) { replaySame = false; break; }
  console.log('重播讀新的', name, '結果相同', replaySame, '| 深蹲', r2.reps.length, '下');
}
// 平滑後的數字真的比較穩：靜止那段（一開始站著 1.5 秒）相鄰格的變化
const jit = key => { let s = 0, n = 0; for (let i = 1; i < 40; i++) { const f0 = nj.frames[i - 1], f1 = nj.frames[i]; if (!f0[key] || !f1[key]) continue; s += Math.abs(f1[key][25][0] - f0[key][25][0]) * 640; n++; } return (s / n).toFixed(2); };
console.log('站著時左膝 x 每格平均變化（像素）：原始', jit('landmarks'), '平滑後', jit('smoothed'));
