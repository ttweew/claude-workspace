// 一個錄製檔的運動總結（和首頁、重播分析同一套 summarize、describe）
import { readFileSync } from 'node:fs';
const W = '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(W + '/js/data/replay-core.js');
const { summarize, describe } = await import(W + '/js/analysis/session.js');
const parsed = parseRecording(readFileSync(process.argv[2], 'utf8'));
const m = parsed.meta;
const out = await analyzeRecording(parsed, m.videoWidth, m.videoHeight, { workout: m.workout });
const s = summarize(m.workout, out.reps, 0, (out.t[out.n - 1] - out.t[0]) * 1000);
console.log(describe(s).join('\n'));
