// 每一種垃圾輸入單獨跑 400 格，接著正常資料：多少格之後才重新認出人？
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const demo = makeDemoRecording({ yaw: 5, noisePx: 1 });
const good = i => demo.frames[i % demo.frames.length].landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const kinds = {
  '沒有人': () => null,
  'x 全壞(NaN)': i => good(i).map(p => ({ ...p, x: NaN })),
  'x 全是無限大': i => good(i).map(p => ({ ...p, x: Infinity })),
  'x 全是 1e9': i => good(i).map(p => ({ ...p, x: 1e9 })),
  '一個點壞掉': i => { const l = good(i); l[25] = { x: NaN, y: NaN, z: NaN, visibility: NaN }; return l; },
  '亂跳': () => Array.from({ length: 33 }, () => ({ x: rnd() * 3 - 1, y: rnd() * 3 - 1, z: rnd() - .5, visibility: rnd() })),
  '沒有可信度': i => good(i).map(p => ({ ...p, visibility: undefined })),
  '全部疊一點': () => Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 })),
  '整個跳開': i => good(i).map(p => ({ ...p, x: p.x + 0.4 })),
};
for (const [name, gen] of Object.entries(kinds)) {
  const pipe = new PosePipeline(); let t = 0, first = null;
  for (let i = 0; i < 100; i++) { pipe.process(good(i), t, 640, 480); t += 33.3; }
  for (let i = 0; i < 400; i++) { pipe.process(gen(i), t, 640, 480); t += 33.3; }
  for (let i = 0; i < 600; i++) { const p = pipe.process(good(i), t, 640, 480); t += 33.3; if (p && first === null) first = i; }
  console.log(name.padEnd(14), '→ 正常資料第', first, '格才認出人');
}
