// 10/20 實測檔：用網站的動作流暢度（fluency.js）跑每一組，印出總結那一句
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const { testInfo } = await import(ROOT + '/js/data/test-mode.js');
const { repSeries } = await import(ROOT + '/js/analysis/rep-series.js');
const { fluencyOf, fluencyLine } = await import(ROOT + '/js/analysis/fluency.js');
const dir = process.argv[2];
for (const f of readdirSync(dir).filter(x => /test_.*\.json(\.crdownload)?$/.test(x)).sort((a, b) => a.slice(9).localeCompare(b.slice(9)))) {
  const parsed = parseRecording(readFileSync(dir + '/' + f, 'utf8'));
  const info = testInfo(parsed.meta);
  if (!info || info.workout === 'plank') continue;
  const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: info.workout });
  console.log(f.slice(9, 40).padEnd(32), fluencyLine(fluencyOf(repSeries(info.workout, r.reps))));
}
