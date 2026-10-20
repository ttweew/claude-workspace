// 用 zip.js 做一個 zip，再交給 Python 的 zipfile 和 unzip 檢查（壓縮、不壓縮、同名、空檔、中文名）
import { makeZip, crc32 } from '/home/user/claude-workspace/js/data/zip.js';
import { writeFileSync } from 'fs';
const big = JSON.stringify({ frames: Array.from({ length: 3000 }, (_, i) => ({ t: i * 33, landmarks: [[0.5123, 0.3011, -0.4, 0.999]] })) });
const files = [
  { name: 'test_A_squat_good_20261020_210512.json', blob: new Blob([big]), date: new Date(2026, 9, 20, 21, 5, 12) },
  { name: 'test_A_squat_good_20261020_210512.json', blob: new Blob(['{"same":1}']), date: new Date() },
  { name: 'empty.json', blob: new Blob([]), date: new Date() },
  { name: '受測者.txt', blob: new Blob(['中文內容']), date: new Date() }
];
for (const compress of [true, false]) {
  const z = await makeZip(files, { compress });
  writeFileSync(process.argv[2] + (compress ? '/c.zip' : '/s.zip'), Buffer.from(await z.arrayBuffer()));
  console.log(compress ? 'compressed' : 'stored', z.size, 'raw', big.length);
}
console.log('crc hello', crc32(new TextEncoder().encode('hello')).toString(16));
