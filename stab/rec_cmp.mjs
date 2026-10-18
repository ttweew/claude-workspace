import { PoseRecorder as Old } from './recorder_old.js';
import { PoseRecorder as New } from './recorder_new.js';
const which = process.argv[2];
const N = 9000;  // 5 分鐘 × 30 格
const rnd = () => Math.random();
const frames = [];
for (let i = 0; i < 200; i++) frames.push({
  lm: Array.from({length: 33}, () => ({x: rnd(), y: rnd(), z: rnd() - .5, visibility: rnd()})),
  w: i % 7 === 3 ? null : Array.from({length: 33}, () => ({x: rnd() - .5, y: rnd() - .5, z: rnd() - .5, visibility: rnd()}))
});
if (which === 'eq') {
  const a = new Old(), b = new New();
  a.start({}); b.start({}); b.meta = a.meta;
  frames.forEach((f, i) => { const lm = i % 11 === 5 ? null : f.lm; a.add(i * 33.3, lm, f.w); b.add(i * 33.3, lm, f.w); });
  console.log('CSV identical:', a.toCSV() === b.toCSV(), ' JSON identical:', a.toJSON() === b.toJSON());
} else {
  const R = which === 'old' ? Old : New;
  const r = new R(); r.start({});
  global.gc(); const m0 = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { const f = frames[i % 200]; r.add(i * 33.3, f.lm, f.w || f.lm); }
  const t1 = performance.now();
  global.gc(); const m1 = process.memoryUsage().heapUsed + process.memoryUsage().arrayBuffers;
  console.log(which, 'memory for 5 min:', ((m1 - m0) / 1e6).toFixed(1), 'MB | per frame add:', ((t1 - t0) / N * 1000).toFixed(1), 'µs');
}
