// 用網站的錄製程式產生 N 分鐘的 JSON、CSV（合成深蹲，每秒 30 格），給重播頁測大檔案
import { PoseRecorder, buildFile } from '../wt-pr6/js/data/recorder.js';
import { demoFrames } from '../wt-pr6/tests/helpers.mjs';
import { writeFileSync } from 'node:fs';
const minutes = Number(process.argv[2] || 20);
const base = demoFrames({ yaw: 5 });
const span = base[base.length - 1].t + 33;
const rec = new PoseRecorder();
rec.start({ videoWidth: 640, videoHeight: 480, app: 'AI 智慧運動分析系統' }, minutes * 60);
let n = 0;
outer: for (let rep = 0; ; rep++) for (const f of base) {
    if (!rec.add(rep * span + f.t, f.raw, f.world, f.raw, f.world)) break outer;
    n++;
}
for (const kind of ['json', 'csv']) {
    const blob = await buildFile(kind === 'json' ? rec.jsonChunks() : rec.csvChunks(), 'text/plain');
    writeFileSync(`big${minutes}.${kind}`, Buffer.from(await blob.arrayBuffer()));
    console.log(kind, (blob.size / 1048576).toFixed(1), 'MB', n, '格');
}
