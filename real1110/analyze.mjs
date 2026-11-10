// 11/10 實體測試的錄製檔（真人，只在暫存區）：照重播分析同一套算每一段
//   次數、每一下的規則錯誤、AI 判斷、AI 評分、AI 猜的動作、拍攝品質（每秒幾格、幾成畫面有人、側面／斜側面／正面）
// 用法：node analyze.mjs <資料夾> > 結果.txt
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const W = '/home/user/claude-workspace';
const { parseRecording, analyzeRecording, VIEW_CODES } = await import(W + '/js/data/replay-core.js');
const AJ = await import(W + '/js/analysis/ai-judge.js');
const { ACTIVITY_NAMES } = await import(W + '/js/analysis/activity.js');
const { WORKOUTS } = await import(W + '/js/analysis/workouts.js');
const dir = process.argv[2];
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
const rows = [];
for (const name of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const parsed = parseRecording(readFileSync(join(dir, name), 'utf8'));
    const m = parsed.meta, id = m.workout;
    const out = await analyzeRecording(parsed, m.videoWidth, m.videoHeight, { workout: id });
    const n = out.n, dur = out.t[n - 1] - out.t[0];
    let present = 0; const views = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) { present += out.present[i]; if (out.present[i]) views[out.view[i]]++; }
    const kind = WORKOUTS[id].kind;
    console.log('==== ' + name + '：' + WORKOUTS[id].name + '，' + dur.toFixed(1) + ' 秒，每秒 ' + (n / dur).toFixed(1) + ' 格，有人 ' + pct(present, n)
        + '（側面 ' + pct(views[1], present) + '、斜側面 ' + pct(views[2], present) + '、正面 ' + pct(views[3], present) + '），鏡頭 ' + m.videoWidth + '×' + m.videoHeight
        + (m.calibration ? '，校正 膝 ' + m.calibration.knee + '° 前傾 ' + m.calibration.tilt + '°' : ''));
    console.log('  AI 猜的動作：' + (out.activity.list.map(x => ACTIVITY_NAMES[x.label] + ' ' + x.seconds + ' 秒').join('、') || '（沒猜）'));
    const reps = out.reps;
    const judged = AJ.judgeReps(id, reps);
    if (kind === 'reps') {
        for (let k = 0; k < reps.length; k++) {
            const r = reps[k], ai = judged && judged[k] ? judged[k].ai : null;
            const score = ai ? AJ.repScore(r, ai) : null;
            console.log('  第 ' + r.n + ' 下 ' + r.start.toFixed(1) + '–' + r.end.toFixed(1) + ' 秒，最低 ' + Math.round(r.min) + '°（' + r.depth + '），相似 ' + r.similarity + '%'
                + '，規則：' + (r.errors.length ? r.errors.join('+') : '做對') + (Object.keys(r.peaks).length ? ' ' + JSON.stringify(r.peaks) : '')
                + '，AI：' + (ai ? AJ.judgeCell(ai) : '—') + '，評分 ' + (score === null ? '—' : score));
        }
    } else {
        for (const h of reps) console.log('  第 ' + h.n + ' 次 ' + (h.start ?? 0).toFixed(1) + '–' + (h.end ?? 0).toFixed(1) + ' 秒（撐 ' + (h.seconds ?? h.duration ?? '?') + ' 秒），規則：' + ((h.errors || []).join('+') || '沒錯') + (h.peaks && Object.keys(h.peaks).length ? ' ' + JSON.stringify(h.peaks) : '')
            + (judged ? '，AI：' + AJ.judgeCell(judged[reps.indexOf(h)].ai) : ''));
    }
    if (judged && judged.length) {
        console.log('  ' + AJ.aiLine(id, reps, judged));
        console.log('  ' + AJ.scoreLine(id, reps, judged));
        const ex = AJ.explainLine(id, reps, judged); if (ex) console.log('  ' + ex);
    }
    const errCount = {};
    for (const r of reps) for (const e of r.errors) errCount[e] = (errCount[e] || 0) + 1;
    const aiCount = {};
    if (judged) for (const j of judged) aiCount[j.ai.label] = (aiCount[j.ai.label] || 0) + 1;
    rows.push({ name, id, dur: dur.toFixed(0), fps: (n / dur).toFixed(0), present: pct(present, n), side: pct(views[1], present), count: reps.length,
        rule: JSON.stringify(errCount), ai: JSON.stringify(aiCount), act: out.activity.top ? ACTIVITY_NAMES[out.activity.top] : '—' });
}
console.log('\n==== 總表');
for (const r of rows) console.log([r.name.slice(5, 20), WORKOUTS[r.id].name, r.dur + ' 秒', r.fps + ' 格/秒', '有人 ' + r.present, '側面 ' + r.side, r.count + (WORKOUTS[r.id].kind === 'hold' ? ' 次' : ' 下'), '規則 ' + r.rule, 'AI ' + r.ai, 'AI 猜 ' + r.act].join(' | '));
