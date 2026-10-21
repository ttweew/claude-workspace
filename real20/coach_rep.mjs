import { readFileSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const p = parseRecording(readFileSync(process.argv[2], 'utf8'));
const r = await analyzeRecording(p, p.meta.videoWidth, p.meta.videoHeight, { workout: 'squat' });
for (const x of r.reps) if (x.start > 160 && x.start < 200) console.log(x.n, x.start.toFixed(2), x.bottom.toFixed(2), x.end.toFixed(2), Math.round(x.minKnee), x.depth);
