import { WorldStabilizer } from '/home/user/claude-workspace/js/skeleton/world.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const rec = makeDemoRecording({});
let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const BAD = [NaN, Infinity, -Infinity, 1e9, 0, null, undefined];
const s = new WorldStabilizer(); let t = 0, problems = [], recovered = 0;
for (let i = 0; i < 20000; i++) {
  const r = rnd(); t += r < 0.02 ? -300 : r < 0.04 ? 0 : r < 0.05 ? 2000 : 33;
  const garbage = Math.floor(i / 300) % 2 === 0;
  let w = rec.frames[i % rec.frames.length].world.map(([x, y, z]) => ({ x, y, z }));
  if (garbage) {
    const k = Math.floor(rnd() * 6);
    if (k === 0) w = null; else if (k === 1) w = w.slice(0, 17);
    else if (k === 2) w.forEach(p => { p.z = BAD[Math.floor(rnd() * BAD.length)]; });
    else if (k === 3) w = w.map(() => ({ x: rnd(), y: rnd(), z: rnd() * 10 - 5 }));
    else if (k === 4) w.forEach(p => { p.x = p.y = p.z = 0; });
  }
  try {
    const out = s.process(w, t);
    if (w && (!out || out.length !== w.length)) problems.push('長度不符 第' + i + '格');
    if (!garbage && i % 300 > 60 && out && out.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) problems.push('正常資料後仍有壞數字 第' + i + '格');
    if (!garbage && i % 300 === 299 && out) recovered++;
  } catch (e) { problems.push('出錯 ' + e.message + ' 第' + i + '格'); }
}
console.log('20000 格 問題', problems.length, problems.slice(0, 5), '| 正常段落結束時恢復', recovered);
