// 平衡與重心（10/24 提案）的試算：每一格用身體各部位的重量比例算 2D 重心，看重心在腳跟 → 腳尖的哪裡
// 各部位重量比例、重心位置：Winter（2009）的表（Dempster 的資料）
import { readFileSync } from 'fs';
const ROOT = process.env.ROOT || '/home/user/claude-workspace';
const { parseRecording } = await import(ROOT + '/js/data/replay-core.js');
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { isVisible, P } = await import(ROOT + '/js/skeleton/landmarks.js');
const SEG = [ // [近端, 遠端, 比例, 重心離近端多遠]
  ['SHOULDER', 'ELBOW', 0.028, 0.436], ['ELBOW', 'WRIST', 0.016, 0.430], ['WRIST', 'INDEX', 0.006, 0.506],
  ['HIP', 'KNEE', 0.100, 0.433], ['KNEE', 'ANKLE', 0.0465, 0.433], ['HEEL', 'FOOT_INDEX', 0.0145, 0.5]];
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
function com(pose) {
  const W = pose.width, H = pose.height, lm = pose.landmarks;
  const pt = k => ({ x: lm[P[k]].x * W, y: lm[P[k]].y * H });
  const vis = (...ks) => ks.every(k => isVisible(lm[P[k]]));
  let sx = 0, sy = 0, sm = 0;
  const add = (p, m) => { sx += p.x * m; sy += p.y * m; sm += m; };
  // 頭：耳朵的中點（看得到的那個）
  const ears = ['LEFT_EAR', 'RIGHT_EAR'].filter(k => vis(k));
  if (!ears.length) return null;
  add({ x: ears.reduce((s, k) => s + pt(k).x, 0) / ears.length, y: ears.reduce((s, k) => s + pt(k).y, 0) / ears.length }, 0.081);
  // 軀幹：肩膀中心和髖部中心的中點
  const sh = ['LEFT_SHOULDER', 'RIGHT_SHOULDER'].filter(k => vis(k)), hp = ['LEFT_HIP', 'RIGHT_HIP'].filter(k => vis(k));
  if (!sh.length || !hp.length) return null;
  const avg = ks => ({ x: ks.reduce((s, k) => s + pt(k).x, 0) / ks.length, y: ks.reduce((s, k) => s + pt(k).y, 0) / ks.length });
  const S = avg(sh), Hc = avg(hp);
  add({ x: (S.x + Hc.x) / 2, y: (S.y + Hc.y) / 2 }, 0.497);
  for (const [a, b, m, r] of SEG) {
    const ok = ['LEFT', 'RIGHT'].filter(s => vis(s + '_' + a, s + '_' + b));
    if (!ok.length) return null;
    for (const s of ok) { const A = pt(s + '_' + a), B = pt(s + '_' + b); add({ x: A.x + (B.x - A.x) * r, y: A.y + (B.y - A.y) * r }, m * 2 / ok.length); }
  }
  return { x: sx / sm, y: sy / sm };
}
function foot(pose) {
  const W = pose.width, lm = pose.landmarks;
  const ok = ['LEFT', 'RIGHT'].filter(s => isVisible(lm[P[s + '_HEEL']]) && isVisible(lm[P[s + '_FOOT_INDEX']]));
  if (!ok.length) return null;
  const heel = ok.reduce((t, s) => t + lm[P[s + '_HEEL']].x * W, 0) / ok.length, toe = ok.reduce((t, s) => t + lm[P[s + '_FOOT_INDEX']].x * W, 0) / ok.length;
  return Math.abs(toe - heel) < 5 ? null : { heel, toe };
}
for (const f of process.argv.slice(2)) {
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(); const rows = [];
  for (const fr of p.frames) {
    const pose = pl.process(fr.raw, fr.t, W, H);
    if (!pose || pose.view.view === 'front') { rows.push(null); continue; }
    const c = com(pose), ft = foot(pose);
    const knee = Math.min(...['LEFT_KNEE', 'RIGHT_KNEE'].map(k => pose.angles[k]).filter(v => v != null));
    if (!c || !ft || !Number.isFinite(knee)) { rows.push(null); continue; }
    rows.push({ t: fr.t / 1000, k: knee, pos: (c.x - ft.heel) / (ft.toe - ft.heel) * 100, len: Math.abs(ft.toe - ft.heel) });
  }
  const ok = rows.filter(Boolean);
  const stand = ok.filter(r => r.k > 165);
  // 站直不動時的晃動：每 3 秒一段，算標準差
  const sds = [];
  for (let i = 0; i < stand.length; i++) {
    const w = stand.filter(r => r.t >= stand[i].t && r.t < stand[i].t + 3);
    if (w.length >= 40 && w[w.length - 1].t - w[0].t > 2.5) { const m = w.reduce((s, r) => s + r.pos, 0) / w.length; sds.push(Math.sqrt(w.reduce((s, r) => s + (r.pos - m) ** 2, 0) / w.length)); i += w.length - 1; }
  }
  const segs = []; let cur = null;
  rows.forEach((r, i) => { if (r && r.k < 150) { if (!cur) cur = { from: i, to: i }; cur.to = i; } else if (cur && (!r || r.k >= 150)) { segs.push(cur); cur = null; } });
  if (cur) segs.push(cur);
  const reps = [];
  for (const s of segs) {
    const seg = rows.slice(s.from, s.to + 1).filter(Boolean);
    if (seg.length < 10 || Math.min(...seg.map(x => x.k)) >= 110) continue;
    const bottom = seg.reduce((a, b) => (b.k < a.k ? b : a));
    reps.push(Math.round(bottom.pos) + '[' + Math.round(Math.min(...seg.map(x => x.pos))) + '..' + Math.round(Math.max(...seg.map(x => x.pos))) + ']');
  }
  console.log(f.split('/').pop().padEnd(20), 'frames', ok.length + '/' + rows.length, 'foot', Math.round(med(ok.map(r => r.len))) + 'px',
    'stand', Math.round(med(stand.map(r => r.pos))) + '%', 'sway', sds.map(x => x.toFixed(1)).join(','), '\n   reps', reps.join(' '));
}
