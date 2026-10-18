import { readFileSync } from 'fs';
import { parseRecording, analyzeRecording, WORLD_BONES } from '/home/user/claude-workspace/js/data/replay-core.js';
const p = parseRecording(readFileSync(process.argv[2],'utf8'));
const r = await analyzeRecording(p, 480, 640, { lab: true });
const B = WORLD_BONES.length;
const groups = { '畫面中間（鼻子 x 0.4～0.6）': [], '靠邊（鼻子 x < 0.3）': [], '站遠（263 秒後）': [] };
for (let i = 0; i < r.n; i++) {
  const lm = p.frames[i].raw; if (!lm) continue;
  const x = lm[0].x, t = r.t[i];
  const g = t > 263 ? '站遠（263 秒後）' : x < 0.3 ? '靠邊（鼻子 x < 0.3）' : (x >= 0.4 && x <= 0.6 ? '畫面中間（鼻子 x 0.4～0.6）' : null);
  if (g) groups[g].push(i);
}
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
for (const [g, idx] of Object.entries(groups)) {
  const out = WORLD_BONES.map(([k, nm], b) => nm + ' ' + (med(idx.map(i => r.boneStable[i * B + b])) * 100).toFixed(1));
  console.log(g, (idx.length / 30).toFixed(0) + ' 秒', out.join('  '));
}
