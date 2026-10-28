// 10/20 實測檔：用網站的疲勞分析（fatigue.js）跑每一組，印出總結那一句、運動中會不會提醒
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const { testInfo } = await import(ROOT + '/js/data/test-mode.js');
const { repSeries } = await import(ROOT + '/js/analysis/rep-series.js');
const { fatigueOf, fatigueLine, FatigueWatch } = await import(ROOT + '/js/analysis/fatigue.js');
const dir = process.argv[2];
for (const f of readdirSync(dir).filter(x => /test_.*\.json(\.crdownload)?$/.test(x)).sort((a, b) => a.slice(9).localeCompare(b.slice(9)))) {
  const parsed = parseRecording(readFileSync(dir + '/' + f, 'utf8'));
  const info = testInfo(parsed.meta);
  if (!info || info.workout === 'plank') continue;
  const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: info.workout });
  const fa = fatigueOf(repSeries(info.workout, r.reps));
  const w = new FatigueWatch(); let live = '';
  for (let n = 1; n <= r.reps.length; n++) { const k = w.check(info.workout, r.reps.slice(0, n)); if (k) live = '第 ' + n + ' 下提醒 ' + k; }
  console.log(f.slice(9, 40).padEnd(32), fatigueLine(fa), live ? '｜' + live : '');
}
