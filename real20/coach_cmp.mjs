import { readFileSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
for (const v of ['v1', 'v2', 'v3', 'v4']) {
  const p = parseRecording(readFileSync(process.argv[2] + '/' + v + '.json', 'utf8'));
  const r = await analyzeRecording(p, p.meta.videoWidth, p.meta.videoHeight, { workout: 'squat' });
  const errs = {}; for (const it of r.reps) for (const e of it.errors) errs[e] = (errs[e] || 0) + 1;
  console.log(v, r.reps.length + '下', JSON.stringify(errs), r.reps.map(x => x.start.toFixed(0)).join(','));
}
