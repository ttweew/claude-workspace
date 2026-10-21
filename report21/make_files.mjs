// 實測報表的瀏覽器測試用的合成檔案（不是真人）：示範資料的深蹲加上實測資訊
// 用法：node make_files.mjs <網站資料夾> <輸出資料夾>
import { writeFileSync } from 'fs';
const [root, out] = process.argv.slice(2);
const { makeDemoRecording } = await import(root + '/js/data/synth.js');
const { testMeta } = await import(root + '/js/data/test-mode.js');
const { makeZip } = await import(root + '/js/data/zip.js');
const make = (subject, condition, depths, startedAt) => {
  const rec = makeDemoRecording({ yaw: 8, depths });
  rec.meta.workout = 'squat';
  rec.meta.test = testMeta(subject, condition, 'squat');
  rec.meta.startedAt = startedAt;
  return JSON.stringify(rec);
};
const files = {
  'test_A_squat_good_20261020_210000.json': make('A', 'good', [90, 85, 95, 88, 92], '2026-10-20T13:00:00.000Z'),            // 第一次：只做 5 下（重錄）
  'test_A_squat_good_20261020_210500.json': make('A', 'good', [90, 85, 95, 88, 92, 90, 85, 95, 88, 92], '2026-10-20T13:05:00.000Z'),
  'test_A_squat_lean_20261020_211000.json': make('A', 'lean', [90, 85, 95, 88, 92], '2026-10-20T13:10:00.000Z'),
  'pose_20261020_211500.json': JSON.stringify(Object.assign(makeDemoRecording({ yaw: 8 }), {})),
  'broken.json': '{"format":"ai-sport-pose","frames":[',
  'notes.txt': 'hello'
};
for (const [n, t] of Object.entries(files)) writeFileSync(out + '/' + n, t);
const zip = await makeZip(['test_A_squat_good_20261020_210500.json', 'test_A_squat_lean_20261020_211000.json'].map(n => ({ name: n, blob: new Blob([files[n]]), date: new Date() })));
writeFileSync(out + '/bundle.zip', Buffer.from(await zip.arrayBuffer()));
console.log('ok');
