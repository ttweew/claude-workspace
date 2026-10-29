// 10/20 實測檔：把每一下的角度曲線（算相似度用的 samples）存下來，給流暢度試算法用
import { readFileSync, readdirSync, writeFileSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const { testInfo } = await import(ROOT + '/js/data/test-mode.js');
const { WorkoutTracker } = await import(ROOT + '/js/analysis/tracker.js');
const orig = WorkoutTracker.prototype.attach;
WorkoutTracker.prototype.attach = function (item) { if (item.samples) item.keep = item.samples.map(s => [Math.round(s.t), +s.v.toFixed(2)]); return orig.call(this, item); };
const dir = process.argv[2], out = [];
for (const f of readdirSync(dir).filter(x => /test_.*\.json(\.crdownload)?$/.test(x)).sort((a, b) => a.slice(9).localeCompare(b.slice(9)))) {
  const parsed = parseRecording(readFileSync(dir + '/' + f, 'utf8'));
  const info = testInfo(parsed.meta);
  if (!info || info.workout === 'plank') continue;
  const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: info.workout });
  out.push({ name: f.slice(9, 40), workout: info.workout, intent: info.intent || info.set || '', reps: r.reps.map(x => ({ n: x.n, start: x.start, bottom: x.bottom, end: x.end, min: x.min, errors: x.errors, sim: x.similarity, s: x.keep })) });
}
writeFileSync('reps.json', JSON.stringify(out));
console.log(out.map(o => o.name + ' ' + o.reps.length + ' ' + (o.reps[0] && o.reps[0].s ? o.reps[0].s.length : 0)).join('\n'));
