// 比較目前版本（cur）與修正版本（fix）：6 種真實情境＋走近再退回＋亂跳後恢復
import fs from 'fs';
const variant = process.argv[2];
const { PoseSmoother } = await import(`./${variant}/smooth.js`);
const { GhostFilter } = await import(`./${variant}/ghost.js`);
const { isVisible, isMainJoint, P } = await import(`./${variant}/landmarks.js`);
const toLm = pts => pts.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
const AR = 480 / 640;
const SWAP = Array.from({ length: 33 }, (_, i) => i);
for (let i = 0; i < 33; i++) { const k = Object.keys(P).find(k => P[k] === i); const o = k.startsWith('LEFT_') ? 'RIGHT_' + k.slice(5) : k.startsWith('RIGHT_') ? 'LEFT_' + k.slice(6) : k; SWAP[i] = P[o]; }
function run(seq) {
  const sm = new PoseSmoother(), gf = new GhostFilter();
  let frames = 0, bad = 0, badFrames = 0, miss = 0, truthMain = 0, toggles = 0, prev = null;
  const d = (p, t) => Math.hypot((p.x - t[0]) * AR, p.y - t[1]);
  for (const fr of seq.frames) {
    frames++;
    let l = fr.pts ? sm.smooth(toLm(fr.pts), fr.t) : null, show = new Array(33).fill(false);
    const K = Number(process.env.K || 0);
    if (l) { if (K && fr.t - (globalThis.__seen ?? -1e9) > K) gf.reset(); globalThis.__seen = fr.t; if (gf.update(l, fr.t, 480, 640)) show = l.map(isVisible); } else if (!K) gf.reset();
    let b = 0;
    for (let i = 0; i < 33; i++) {
      const tin = fr.truth && fr.truth[i][2] >= 0.5 && fr.truth[i][0] >= 0.02 && fr.truth[i][0] <= 0.98 && fr.truth[i][1] >= 0.02 && fr.truth[i][1] <= 0.98;
      if (show[i] && (!fr.truth || Math.min(d(l[i], fr.truth[i]), d(l[i], fr.truth[SWAP[i]])) > 0.1)) b++;
      if (isMainJoint(i) && tin) { truthMain++; if (!show[i]) miss++; }
      if (prev && prev[i] !== show[i]) toggles++;
    }
    bad += b; if (b) badFrames++; prev = show;
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + '%';
  return `錯位格 ${pct(badFrames, frames)} 錯位點/格 ${(bad / frames).toFixed(2)} 漏畫 ${pct(miss, truthMain)} 閃爍 ${(toggles / (frames / 30)).toFixed(1)}/秒`;
}
const out = [];
for (const n of ['walk', 'waistup', 'panout', 'empty', 'dark', 'close']) {
  for (const tag of ['c0.5', 'c0.5_full_VIDEO']) {
    const seq = JSON.parse(fs.readFileSync(`seq_${n}_${tag}.json`));
    out.push(`${n.padEnd(8)} ${tag.padEnd(16)} ${run(seq)}`);
  }
}
// 走近再退回：正常 3 秒 → 0.4 秒內放大到 2 倍（走近）→ 停 2 秒 → 0.4 秒內縮回（退回）→ 站著 8 秒
const { makeDemoRecording } = await import('/home/user/claude-workspace/js/data/synth.js');
const demo = makeDemoRecording({ yaw: 5, noisePx: 1 });
function scaled(i, k) { return demo.frames[i % demo.frames.length].landmarks.map(([x, y, z, v]) => ({ x: 0.5 + (x - 0.5) * k, y: 0.5 + (y - 0.5) * k, z, visibility: v })); }
for (const [name, backMs] of [['走近再退回(0.4秒)', 400], ['走近再退回(0.8秒)', 800], ['走近再退回(0.2秒)', 200]]) {
  const sm = new PoseSmoother(), gf = new GhostFilter(); let t = 0, lostAt = null, back = null, shownLast = 0, total = 0;
  const scaleAt = ms => ms < 3000 ? 1 : ms < 3400 ? 1 + (ms - 3000) / 400 : ms < 5400 ? 2 : ms < 5400 + backMs ? 2 - (ms - 5400) / backMs : 1;
  for (let i = 0; t < 14000; i++, t += 33.3) {
    const l = sm.smooth(scaled(i, scaleAt(t)), t);
    const ok = gf.update(l, t, 640, 480);
    if (t > 5400 + backMs + 500) { total++; if (ok) shownLast++; }
    if (!ok && lostAt === null && t > 5400) lostAt = t;
    if (ok && lostAt !== null && back === null) back = t;
  }
  out.push(`${name} 退回後站著時認得出人 ${(100 * shownLast / total).toFixed(0)}%` + (lostAt ? ` | 第 ${(lostAt / 1000).toFixed(1)} 秒判定成鬼骨架，${back ? (back / 1000).toFixed(1) + ' 秒恢復' : '一直沒恢復'}` : ' | 沒有誤判'));
}
// 人走出畫面，模型留下一副越縮越小的骨架（3 秒內縮到 4 成）→ 不應該再畫出來
{
  const sm = new PoseSmoother(), gf = new GhostFilter(); let t = 0, ghostShown = 0, n = 0;
  for (let i = 0; t < 9000; i++, t += 33.3) {
    const k = t < 3000 ? 1 : Math.max(0.4, 1 - (t - 3000) / 3000 * 0.6);
    const l = sm.smooth(scaled(i, k), t); const ok = gf.update(l, t, 640, 480);
    if (t > 3600) { n++; if (ok) ghostShown++; }
  }
  out.push(`鬼骨架越縮越小（3 秒縮到 4 成後停住） 畫出鬼骨架的格 ${(100 * ghostShown / n).toFixed(0)}%`);
}
console.log(out.join('\n'));
