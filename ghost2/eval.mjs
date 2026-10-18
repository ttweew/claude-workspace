import fs from 'fs';
import { PoseSmoother } from './lib/smooth.js';
import { isVisible, isMainJoint, P } from './lib/landmarks.js';
const toLm = pts => pts.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));

// ---- 候選過濾方式 ----
// F0：目前的做法
function F0() { const sm = new PoseSmoother(); return (pts, t) => { if (!pts) { return null; } const l = sm.smooth(toLm(pts), t); return { l, show: l.map(isVisible) }; }; }
// F1：遲滯（出現要連續 N 格夠清楚、消失要低於較低門檻）
function F1(opt = {}) {
  const ON = opt.on ?? 0.75, OFF = opt.off ?? 0.6, N = opt.n ?? 3;
  const sm = new PoseSmoother(); let shown = null, streak = null;
  return (pts, t) => {
    if (!pts) { shown = null; streak = null; return null; }
    const l = sm.smooth(toLm(pts), t);
    if (!shown) { shown = l.map(() => false); streak = l.map(() => 0); }
    const inFrame = p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    l.forEach((p, i) => {
      if (shown[i]) { if (p.visibility < OFF || !inFrame(p)) { shown[i] = false; streak[i] = 0; } }
      else { streak[i] = p.visibility >= ON && inFrame(p) ? streak[i] + 1 : 0; if (streak[i] >= N) shown[i] = true; }
    });
    return { l, show: chain(opt.chain, shown.slice()) };
  };
}
// 骨架鏈：遠端的點要靠近身體那一端的點也看得到才畫
const PARENT = {};
for (const s of ['LEFT', 'RIGHT']) {
  PARENT[P[s + '_ELBOW']] = P[s + '_SHOULDER']; PARENT[P[s + '_WRIST']] = P[s + '_ELBOW'];
  for (const k of ['PINKY', 'INDEX', 'THUMB']) PARENT[P[s + '_' + k]] = P[s + '_WRIST'];
  PARENT[P[s + '_KNEE']] = P[s + '_HIP']; PARENT[P[s + '_ANKLE']] = P[s + '_KNEE'];
  PARENT[P[s + '_HEEL']] = P[s + '_ANKLE']; PARENT[P[s + '_FOOT_INDEX']] = P[s + '_ANKLE'];
}
function chain(on, show) {
  if (!on) return show;
  for (let i = 0; i < 33; i++) { let j = i; while (PARENT[j] !== undefined) { j = PARENT[j]; if (!show[j]) { show[i] = false; break; } } }
  return show;
}
function F0chain() { const f = F0(); return (pts, t) => { const r = f(pts, t); if (r) r.show = chain(true, r.show); return r; }; }

// ---- 評分 ----
// 錯位點：畫出來的位置離正確位置超過畫面高度的 10%（左右認反不算錯）；沒有人的畫面畫出任何點都算錯
// 漏畫：正確位置在畫面內（留 2% 邊）而且看得到的主要關節，卻沒有畫出來
const AR = 480 / 640;
const SWAP = Array.from({ length: 33 }, (_, i) => i);
for (let i = 0; i < 33; i++) { const k = Object.keys(P).find(k => P[k] === i); const o = k.startsWith('LEFT_') ? 'RIGHT_' + k.slice(5) : k.startsWith('RIGHT_') ? 'LEFT_' + k.slice(6) : k; SWAP[i] = P[o]; }
function score(seq, mk) {
  const f = mk(); let frames = 0, bad = 0, badFrames = 0, badMain = 0, miss = 0, truthMain = 0, toggles = 0; let prev = null;
  const d = (p, t) => Math.hypot((p.x - t[0]) * AR, p.y - t[1]);
  for (const fr of seq.frames) {
    frames++;
    const r = f(fr.pts, fr.t);
    const show = r ? r.show : new Array(33).fill(false);
    let b = 0;
    for (let i = 0; i < 33; i++) {
      const tin = fr.truth && fr.truth[i][2] >= 0.5 && fr.truth[i][0] >= 0.02 && fr.truth[i][0] <= 0.98 && fr.truth[i][1] >= 0.02 && fr.truth[i][1] <= 0.98;
      if (show[i]) {
        const wrong = !fr.truth || Math.min(d(r.l[i], fr.truth[i]), d(r.l[i], fr.truth[SWAP[i]])) > 0.1;
        if (wrong) { b++; if (isMainJoint(i)) badMain++; }
      }
      if (isMainJoint(i) && tin) { truthMain++; if (!show[i]) miss++; }
      if (prev && prev[i] !== show[i]) toggles++;
    }
    bad += b; if (b) badFrames++; prev = show;
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + '%';
  return { 有錯位點的格: pct(badFrames, frames), 錯位點每格: (bad / frames).toFixed(2), 漏畫主要關節: pct(miss, truthMain), 閃爍每秒: (toggles / (frames / 30)).toFixed(1) };
}
// 人形遮罩：點所在位置（附近 3% 範圍）要有人的像素
function withMask(mk, th = 0.3) { return () => { const f = mk(); return (pts, t) => { const r = f(pts, t); if (r && pts && pts[0].length > 4) { r.show = r.show.map((s, i) => s && pts[i][4] >= th); r.show = chain(true, r.show); } return r; }; }; }
// 塌縮保護：身體大小（軀幹長＋肩寬＋髖寬）在 0.3 秒內縮小超過 SHRINK，或小於 MIN，就當作沒有人（鬼骨架）
// 一旦判定，要等大小回到塌縮前的 70% 以上（或偵測重新開始）才再顯示
function guard(mk, opt = {}) {
  const SHRINK = opt.shrink ?? 0.3, MIN = opt.min ?? 0.15, WIN = 300;
  return () => {
    const f = mk(); let hist = [], ghostRef = 0;
    return (pts, t) => {
      const r = f(pts, t);
      if (!pts) { hist = []; ghostRef = 0; return r; }
      const AR = 0.75, d = (a, b) => Math.hypot((a[0] - b[0]) * AR, a[1] - b[1]);
      const mid = (a, b) => [(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2];
      const S = d(mid(11, 12), mid(23, 24)) + d(pts[11], pts[12]) + d(pts[23], pts[24]);
      hist.push([t, S]); while (hist.length && t - hist[0][0] > WIN) hist.shift();
      const ref = Math.max(...hist.map(h => h[1]));
      if (!ghostRef && (S < ref * (1 - SHRINK) || S < MIN)) ghostRef = Math.max(ref, MIN / 0.7);
      if (ghostRef && S >= ghostRef * 0.7) ghostRef = 0;
      if (ghostRef && r) r.show = r.show.map(() => false);
      return r;
    };
  };
}
const FILTERS = {
  '目前': F0, '目前+骨架鏈': F0chain,
  '遲滯 0.75/0.6/3格': () => F1(), '遲滯+骨架鏈': () => F1({ chain: true }),
  '遲滯 0.8/0.6/4格+鏈': () => F1({ on: 0.8, n: 4, chain: true }),
  '鏈+塌縮': guard(F0chain), '遲滯+鏈+塌縮': guard(() => F1({ chain: true })), '遲滯0.8+鏈+塌縮': guard(() => F1({ on: 0.8, n: 4, chain: true })),
  '遲滯+鏈+塌縮20%': guard(() => F1({ chain: true }), { shrink: 0.2 }),
};
const conf = process.argv[2] || 'c0.5';
const names = ['walk', 'waistup', 'panout', 'empty', 'dark', 'close'];
for (const n of names) {
  const file = `seq_${n}_${conf}.json`; if (!fs.existsSync(file)) continue;
  const seq = JSON.parse(fs.readFileSync(file));
  console.log(`\n== ${n}（${conf}）`);
  for (const [k, mk] of Object.entries(FILTERS)) console.log(k.padEnd(18), JSON.stringify(score(seq, mk)));
}
