// 模擬錄製 N 分鐘（每秒 30 格），量記憶體、匯出時間和檔案大小
import { PoseRecorder, buildFile } from '../wt-pr6/js/data/recorder.js';
globalThis.performance ??= { now: () => Date.now() };
const minutes = Number(process.argv[2] || 5);
const frames = minutes * 60 * 30;
const pt = (i, j) => ({ x: 0.3 + 0.4 * Math.sin(i / 50 + j), y: 0.2 + 0.6 * Math.cos(i / 70 + j), z: -0.1 * Math.sin(j), visibility: 0.9 });
const wp = (i, j) => ({ x: 0.2 * Math.sin(j + i / 90), y: 0.4 * Math.cos(j), z: -0.05 * Math.sin(i / 60) });
global.gc && gc();
const base = process.memoryUsage();
const rec = new PoseRecorder();
// 上限調大，才量得到長時間錄製
// 用新的上限參數
rec.start({ test: true }, minutes * 60 + 5);
const lms = [...Array(33)].map((_, j) => pt(0, j)), w = [...Array(33)].map((_, j) => wp(0, j));
for (let i = 0; i < frames; i++) {
    const L = lms.map((p, j) => pt(i, j)), W = w.map((p, j) => wp(i, j));
    if (!rec.add(i * 33.3, L, W, L, W)) { console.log('stopped at', i); break; }
}
global.gc && gc();
const after = process.memoryUsage();
const mb = b => (b / 1048576).toFixed(1);
console.log(`${minutes} 分鐘 ${rec.frameCount} 格：錄製中記憶體 heap +${mb(after.heapUsed - base.heapUsed)} MB、arrayBuffers +${mb(after.arrayBuffers - base.arrayBuffers)} MB`);
for (const kind of ['json', 'csv']) {
    const t0 = Date.now();
    const blob = await buildFile(kind === 'json' ? rec.jsonChunks() : rec.csvChunks(), 'text/plain');
    const peak = process.memoryUsage();
    console.log(`  ${kind}: ${mb(blob.size)} MB，產生 ${((Date.now() - t0) / 1000).toFixed(1)} 秒，當下 heap ${mb(peak.heapUsed)} MB`);
}
