// 同一份錄製檔，用 repo 的兩個版本（改之前、改之後）的重播分析算：次數、每一下最低的手肘
import { readFileSync } from 'node:fs';
const [root, ...files] = process.argv.slice(2);
const { parseRecording, analyzeRecording } = await import(root + '/js/data/replay-core.js');
for (const f of files) {
  const parsed = parseRecording(readFileSync(f, 'utf8'));
  const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: parsed.meta.workout });
  console.log(f.split('/').pop(), parsed.meta.model, r.reps.length + ' 下', '每一下最低：' + r.reps.map(x => Math.round(x.min)).join('、'));
}
