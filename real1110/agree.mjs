// 真人的錄製檔（沒有答案）：每一下 AI 判斷和規則一樣幾下；每一段 AI 自動辨識動作最常猜的是不是錄的那個動作、有把握的秒數占多少
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const W = '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(W + '/js/data/replay-core.js');
const { judgeReps } = await import(W + '/js/analysis/ai-judge.js');
const { ACTIVITY_NAMES } = await import(W + '/js/analysis/activity.js');
let same = 0, total = 0; const by = {};
for (const name of readdirSync(process.argv[2]).filter(f => f.endsWith('.json')).sort()) {
    const parsed = parseRecording(readFileSync(join(process.argv[2], name), 'utf8'));
    const m = parsed.meta;
    const out = await analyzeRecording(parsed, m.videoWidth, m.videoHeight, { workout: m.workout });
    const judged = judgeReps(m.workout, out.reps) || [];
    for (const j of judged) { total++; if (j.rule === j.ai.label) same++; }
    const dur = out.t[out.n - 1] - out.t[0];
    const top = out.activity.top;
    const b = by[m.workout] = by[m.workout] || { files: 0, right: 0, sure: 0, dur: 0 };
    b.files++; if (top === m.workout) b.right++;
    b.sure += out.activity.list.filter(x => x.label === m.workout).reduce((a, x) => a + x.seconds, 0); b.dur += dur;
    console.log(name.slice(5, 20), m.workout, '最常猜', top ? ACTIVITY_NAMES[top] : '—', '｜猜對的秒數', out.activity.list.filter(x => x.label === m.workout).reduce((a, x) => a + x.seconds, 0), '／', dur.toFixed(0));
}
console.log('AI 判斷和規則一樣：' + same + '／' + total + ' 下');
for (const [w, b] of Object.entries(by)) console.log(w + '：最常猜對 ' + b.right + '／' + b.files + ' 段；猜對的秒數 ' + b.sure + '／' + Math.round(b.dur) + ' 秒');
