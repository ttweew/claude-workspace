import { PoseRecorder as Old } from './recorder_old.js';
import { PoseRecorder as New } from './recorder_new.js';
let ok = true;
for (const n of [0, 1, 49, 50, 51, 137, 3000]) {
  const a = new Old(), b = new New();
  const meta = { app: 'x', computeMode: 'GPU', videoWidth: 640, undef: undefined, ua: 'a"b\\c' };
  a.start(meta); b.start(meta); b.meta = a.meta;
  for (let i = 0; i < n; i++) {
    const has = i % 7 !== 3;
    const pts = has ? Array.from({length: 33}, (_, j) => ({x: Math.sin(i+j), y: Math.cos(i*j), z: (i % 5 === 0 && j === 3) ? NaN : -j/7, visibility: j === 5 ? undefined : 0.5})) : null;
    const w = has && i % 3 ? pts.map(p => ({x: p.x/3, y: p.y, z: p.z})) : null;
    a.add(i * 33.37, pts, w); b.add(i * 33.37, pts, w);
  }
  const c = a.toCSV() === b.toCSV(), j = a.toJSON() === b.toJSON();
  const blob = await (await import('./recorder_new.js')).buildFile(b.jsonChunks(), 'x');
  const bj = (await blob.text()) === a.toJSON();
  const bc = Buffer.from(await (await (await import('./recorder_new.js')).buildFile(b.csvChunks(), 'x')).arrayBuffer()).equals(Buffer.from(a.toCSV(), 'utf8'));
  console.log(n, 'csv', c, 'json', j, 'blob', bj, bc, 'valid', !!JSON.parse(b.toJSON()));
  ok = ok && c && j && bj && bc;
}
console.log(ok ? 'ALL SAME' : 'DIFF');
