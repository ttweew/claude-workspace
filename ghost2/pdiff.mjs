import fs from 'fs';
const seq = JSON.parse(fs.readFileSync('seq_panout_c0.5.json'));
const mods = {};
for (const v of ['g_old','g_new']) { const S = await import(`./${v}/smooth.js`), G = await import(`./${v}/ghost.js`); mods[v] = { sm: new S.PoseSmoother(), gf: new G.GhostFilter() }; }
const toLm = pts => pts.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
let i=0;
for (const fr of seq.frames) {
  const r = {};
  for (const v of ['g_old','g_new']) { const m=mods[v]; if (!fr.pts) { m.gf.reset(); r[v]='-'; continue; } const l=m.sm.smooth(toLm(fr.pts), fr.t); r[v]=m.gf.update(l, fr.t, 480, 640)?'S':'H'; }
  const g=mods.g_new.gf, s=g.sizes[g.sizes.length-1]||[];
  if (r.g_old!==r.g_new) console.log(i, (fr.t/1000).toFixed(2), r.g_old, r.g_new, 'size', s[1]?.toFixed(3), 'torso', s[2]?.toFixed(3), 'w', s[3]?.toFixed(3), 'truth?', !!fr.truth && fr.truth.filter(q=>q[2]>=0.5).length);
  i++;
}
