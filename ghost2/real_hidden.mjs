// 真實錄影：畫面上有骨架的比例（人一直都在畫面裡）
import { readFileSync } from 'fs';
const v = process.argv[2];
const { PoseSmoother } = await import(`./${v}/smooth.js`);
const { GhostFilter } = await import(`./${v}/ghost.js`);
for (const f of ['2ef82f59-pose_20261005_133933.json', 'e1f4647b-pose_20261005_134842.json', '8d4abbdf-pose_20261005_144512.json']) {
  const d = JSON.parse(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/' + f, 'utf8'));
  const sm = new PoseSmoother(), gf = new GhostFilter(); let shown = 0, det = 0, hiddenT = [];
  for (const fr of d.frames) {
    if (!fr.landmarks) { gf.reset(); continue; }
    det++;
    const l = sm.smooth(fr.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })), fr.t);
    if (gf.update(l, fr.t, 480, 640)) shown++; else hiddenT.push(fr.t / 1000);
  }
  console.log(v, f.slice(14, 29), '偵測到的格中畫出骨架', (shown / det * 100).toFixed(1) + '%', hiddenT.length ? `藏起來 ${hiddenT[0].toFixed(1)}–${hiddenT[hiddenT.length - 1].toFixed(1)} 秒` : '');
}
