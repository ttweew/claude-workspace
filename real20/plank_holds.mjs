// 棒式實測檔：每一次（開始、結束、秒數、錯誤）；ROOT 指定程式版本
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT || '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const dir = process.argv[2];
for (const f of readdirSync(dir).filter(x => x.includes('plank') && x.endsWith('.json')).sort()) {
  const p = parseRecording(readFileSync(dir + '/' + f, 'utf8'));
  const r = await analyzeRecording(p, p.meta.videoWidth, p.meta.videoHeight, { workout: 'plank' });
  console.log(f.padEnd(18), r.reps.map(h => `${h.start.toFixed(1)}-${h.end.toFixed(1)}s ${h.seconds.toFixed(1)}秒 ${JSON.stringify(h.errors)}`).join(' | ') || '（沒有紀錄）');
}
