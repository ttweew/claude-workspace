import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/2ef82f59-pose_20261005_133933.json', 'utf8'));
const AR = 480 / 640;
const L = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];
for (const t of [20, 22, 24, 26, 27.5, 28, 29, 30, 31, 32, 34]) {
  const f = d.frames.reduce((a, b) => Math.abs(b.t / 1000 - t) < Math.abs(a.t / 1000 - t) ? b : a);
  const l = f.landmarks.map(([x, y, z, v]) => ({ x, y, v }));
  const dist = (a, b) => Math.hypot((a.x - b.x) * AR, a.y - b.y); const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const trunk = dist(mid(l[11], l[12]), mid(l[23], l[24])) + dist(l[11], l[12]) + dist(l[23], l[24]);
  const limbs = L.map(([a, b]) => dist(l[a], l[b]));
  const sorted = [...limbs].sort((a, b) => a - b);
  console.log(t, 'trunk', trunk.toFixed(3), 'limbs', limbs.map(x => x.toFixed(3)).join(' '), 'limb 第2長的', sorted[6].toFixed(3), 'max', sorted[7].toFixed(3));
}
