// 每一組裡不到 1 秒的那幾下：時間、最低角度、深度（ROOT 指定程式版本）
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT || '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const dir = process.argv[2];
for (const f of readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
  const p = parseRecording(readFileSync(dir + '/' + f, 'utf8'));
  if (p.meta.workout === 'plank') continue;
  const r = await analyzeRecording(p, p.meta.videoWidth, p.meta.videoHeight, { workout: p.meta.workout });
  const q = r.reps.filter(x => x.end - x.start < 1.0).map(x => `#${x.n} ${x.start.toFixed(2)}-${x.end.toFixed(2)} (${(x.end - x.start).toFixed(2)}s) min ${Math.round(x.min ?? x.minKnee)} ${x.depth}`);
  if (q.length) console.log(f.padEnd(20), q.join(' | '));
}
