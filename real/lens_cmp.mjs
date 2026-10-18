import { readFileSync } from 'fs';
import { parseRecording, analyzeRecording, WORLD_BONES, ANGLE_KEYS, VIEW_CODES } from '/home/user/claude-workspace/js/data/replay-core.js';
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
for (const [name, f] of [['廣角', '../ipad_zip/ipad.json'], ['一般', '../ipad_zip/moves.json']]) {
  const p = parseRecording(readFileSync(f, 'utf8'));
  const r = await analyzeRecording(p, 480, 640, { lab: true });
  const B = WORLD_BONES.length, A = ANGLE_KEYS.length;
  const kl = ANGLE_KEYS.indexOf('LEFT_KNEE'), kr = ANGLE_KEYS.indexOf('RIGHT_KNEE');
  for (const view of ['front', 'side']) {
    const idx = [];
    for (let i = 0; i < r.n; i++) {
      const lm = p.frames[i].raw; if (!lm || !r.present[i] || VIEW_CODES[r.view[i]] !== view) continue;
      const x = lm[0].x; if (x < 0.38 || x > 0.62) continue;
      const a = r.angles[i * A + kl], b = r.angles[i * A + kr];
      if (!((a > 165) || (b > 165))) continue;
      idx.push(i);
    }
    const s = WORLD_BONES.map(([k, nm], b) => nm + ' ' + (med(idx.map(i => r.boneStable[i * B + b])) * 100).toFixed(1)).join('  ');
    const h = med(idx.map(i => { const l = p.frames[i].raw; return Math.max(l[27].y, l[28].y) - l[0].y; }));
    console.log(name, view === 'front' ? '正面站直' : '側面站直', (idx.length / 30).toFixed(0) + '秒', '人佔畫面高', (h * 100).toFixed(0) + '%', '|', s);
  }
}
