// 看一個錄製檔分析出來的每一下有哪些欄位（不印座標）：node peek.mjs <檔案>
import { readFileSync } from 'node:fs';
const W = '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(W + '/js/data/replay-core.js');
const parsed = parseRecording(readFileSync(process.argv[2], 'utf8'));
const out = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: parsed.meta.workout });
console.log('workout', out.workout, 'reps', out.reps.length);
if (out.reps[0]) { const r = out.reps[0]; console.log(Object.keys(r).join(', ')); console.log(JSON.stringify({ ...r, features: undefined }).slice(0, 600)); }
console.log('activity', JSON.stringify(out.activity));
