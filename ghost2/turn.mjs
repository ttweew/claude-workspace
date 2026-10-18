// 合成：正面站著 2 秒 → 在 turnMs 內轉成側面 → 側面站 2 秒；看有幾格骨架被藏起來
const v = process.argv[2];
const { PoseSmoother } = await import(`./${v}/smooth.js`);
const { GhostFilter } = await import(`./${v}/ghost.js`);
const { makeDemoRecording } = await import('/home/user/claude-workspace/js/data/synth.js');
const yaws = {}; for (let y = 0; y <= 90; y += 5) yaws[y] = makeDemoRecording({ yaw: y, depths: [], lead: 5, noisePx: 1 }).frames;
const out = [];
for (const turnMs of [150, 300, 600]) for (const [from, to] of [[90, 5], [5, 90], [90, 45]]) {
  const sm = new PoseSmoother(), gf = new GhostFilter(); let hidden = 0;
  for (let i = 0, t = 0; t < 4500; i++, t += 33.3) {
    const k = Math.min(1, Math.max(0, (t - 2000) / turnMs));
    const y = Math.round((from + (to - from) * k) / 5) * 5;
    const f = yaws[y][i % 100];
    const l = sm.smooth(f.landmarks.map(([x, yy, z, visibility]) => ({ x, y: yy, z, visibility })), t);
    if (!gf.update(l, t, 640, 480)) hidden++;
  }
  out.push(`${from}°→${to}° ${turnMs}ms 藏 ${hidden} 格`);
}
console.log(v, out.join(' | '));
