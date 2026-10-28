// 10/20 實測檔：每一組的前三分之一和後三分之一差多少（沒有疲勞時的自然差異，用來訂門檻）
import { readFileSync, readdirSync } from 'fs';
const ROOT = process.env.ROOT;
const { parseRecording, analyzeRecording } = await import(ROOT + '/js/data/replay-core.js');
const { testInfo } = await import(ROOT + '/js/data/test-mode.js');
const dir = process.argv[2];
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
for (const f of readdirSync(dir).filter(x => /test_.*\.json(\.crdownload)?$/.test(x)).sort((a, b) => a.slice(9).localeCompare(b.slice(9)))) {
  let parsed;
  try { parsed = parseRecording(readFileSync(dir + '/' + f, 'utf8')); } catch (e) { console.log(f.slice(9), 'parse fail', e.message.slice(0, 40)); continue; }
  const info = testInfo(parsed.meta);
  if (!info || info.workout === 'plank') continue;
  const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: info.workout });
  const reps = r.reps;
  const n = reps.length, k = Math.max(1, Math.floor(n / 3));
  const fr = reps.slice(0, k), bk = reps.slice(n - k);
  const dur = x => mean(x.map(r => r.end - r.start)), ang = x => mean(x.map(r => r.min)), err = x => x.filter(r => r.errors.length).length / x.length;
  const sim = x => { const v = x.map(r => r.similarity).filter(s => typeof s === 'number'); return v.length ? mean(v) : NaN; };
  const gaps = reps.slice(1).map((r, i) => r.start - reps[i].end);
  console.log(f.slice(9, 40).padEnd(32), 'n', String(n).padStart(2), 'k', k,
    'dur', dur(fr).toFixed(2), '→', dur(bk).toFixed(2), ('x' + (dur(bk) / dur(fr)).toFixed(2)).padStart(6),
    '| ang', ang(fr).toFixed(0), '→', ang(bk).toFixed(0), ('Δ' + (ang(bk) - ang(fr)).toFixed(1)).padStart(6),
    '| err', err(fr).toFixed(2), '→', err(bk).toFixed(2),
    '| sim', sim(fr).toFixed(0), '→', sim(bk).toFixed(0),
    '| maxgap', gaps.length ? Math.max(...gaps).toFixed(1) : '-', 'durs', reps.map(r => (r.end - r.start).toFixed(1)).join(','));
}
