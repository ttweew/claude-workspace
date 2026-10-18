import { readFileSync } from 'fs';
import { parseRecording, analyzeRecording, ANGLE_KEYS, VIEW_CODES } from '/home/user/claude-workspace/js/data/replay-core.js';
const U = '/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
for (const f of (process.argv[2] ? [process.argv[2]] : ['2ef82f59-pose_20261005_133933.json', 'e1f4647b-pose_20261005_134842.json'])) {
  const p = parseRecording(readFileSync(U + f, 'utf8'));
  const r = await analyzeRecording(p, 640, 480, { lab: true });
  const A = ANGLE_KEYS.length; const fmt = v => Number.isFinite(v) ? Math.round(v).toString().padStart(3) : '  —';
  console.log('\n' + f.slice(9, 29), ' 秒 | 偵測 | 方向(比值) | 左膝 右膝 左髖 右髖 左肘 右肘 | 頭頂y 腳y 鼻x | 看得到:膝L R 踝L R');
  for (let s = 0; s < Math.ceil(r.t[r.n - 1]); s++) {
    const idx = []; for (let i = 0; i < r.n; i++) if (r.t[i] >= s && r.t[i] < s + 1) idx.push(i);
    const med = a => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : NaN; };
    const ang = j => med(idx.map(i => r.angles[i * A + j]));
    const raws = idx.map(i => p.frames[i].raw).filter(Boolean);
    const top = med(raws.map(lm => Math.min(...lm.slice(0, 11).map(q => q.y))));
    const foot = med(raws.map(lm => Math.max(lm[27].y, lm[28].y, lm[31].y, lm[32].y)));
    const nx = med(raws.map(lm => lm[0].x));
    const vis = j => raws.length ? Math.round(raws.filter(lm => lm[j].visibility >= 0.65).length / raws.length * 100) : 0;
    const views = idx.filter(i => r.present[i]).map(i => VIEW_CODES[r.view[i]]); const vc = {}; views.forEach(v => vc[v] = (vc[v] || 0) + 1);
    const vmain = Object.entries(vc).sort((a, b) => b[1] - a[1])[0];
    console.log(String(s).padStart(3), '|', String(Math.round(raws.length / idx.length * 100)).padStart(3) + '%', '|', (vmain ? vmain[0] : '—').padEnd(7), med(idx.map(i => r.ratio[i])).toFixed(2), '|', [0, 1, 2, 3, 4, 5].map(j => fmt(ang(j))).join('  '), '|', top.toFixed(2), foot.toFixed(2), nx.toFixed(2), '|', [25, 26, 27, 28].map(vis).join(' '));
  }
}
