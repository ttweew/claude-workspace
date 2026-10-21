// 用報表的程式（report-core、test-report）跑 10/20 的實測檔，印出每一組和總結（ROOT 指定程式版本）
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT;
const { analyzeOne } = await import(ROOT + '/js/data/report-core.js');
const { setResult, markRedos, summarizeReport, reportCsv } = await import(ROOT + '/js/data/test-report.js');
const dir = process.argv[2];
const rows = [];
for (const f of readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
  const a = await analyzeOne(readFileSync(dir + '/' + f, 'utf8'));
  rows.push(setResult(a.info, a.items, a.kind, a.startedAt, f));
}
markRedos(rows);
for (const r of rows) console.log(r.name.padEnd(20), r.redo ? '重錄' : '    ', r.kind === 'hold' ? r.seconds.toFixed(1) + 's' : r.counted + '/' + r.expected + (r.countOk ? '✓' : '✗'), 'caught', r.caught, 'fa', r.falseAlarms, 'other', r.otherErrors, JSON.stringify(r.errorCounts));
console.log(JSON.stringify(summarizeReport(rows), null, 1));
