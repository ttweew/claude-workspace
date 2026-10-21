// 所有實測檔：網站算的次數、每種錯誤幾下（棒式：秒數、錯誤）；ROOT 環境變數指定用哪一份程式（改前／改後比較）
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT || '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const dir = process.argv[2];
for (const f of readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
  const p = parseRecording(readFileSync(dir + '/' + f, 'utf8'));
  const r = await analyzeRecording(p, p.meta.videoWidth, p.meta.videoHeight, { workout: p.meta.workout });
  const errs = {};
  for (const it of r.reps) for (const e of it.errors) errs[e] = (errs[e] || 0) + 1;
  const extra = p.meta.workout === 'plank' ? r.reps.map(h => h.seconds.toFixed(1) + 's').join(',') : r.reps.length + '下';
  console.log(f.padEnd(20), (p.meta.test.condition + ' ' + (p.meta.test.reps || p.meta.test.seconds + 's')).padEnd(10), extra.padEnd(10), JSON.stringify(errs));
}
