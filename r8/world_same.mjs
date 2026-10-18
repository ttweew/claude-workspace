// 新舊 WorldStabilizer 輸出要完全相同（含 NaN、時間跳、重設、點數不同）
import { WorldStabilizer as O } from './world_old.js';
import { WorldStabilizer as N } from '/home/user/claude-workspace/js/skeleton/world.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
let bad = 0, n = 0;
for (const seed of [1, 2, 3, 7, 11]) for (const yaw of [0, 40, 85]) {
  const d = makeDemoRecording({ yaw, seed, worldNoise: 0.02 * seed, depths: [90, 120, 70, 100], gaps: [[3, 3.3], [6, 7]] });
  const o = new O(), w = new N();
  let t = 0;
  d.frames.forEach((f, i) => {
    let world = f.world && f.world.map(([x, y, z]) => ({ x, y, z }));
    if (world && i % 53 === 7) world[25].z = NaN;
    if (world && i % 97 === 3) world[26] = { x: 5, y: 5, z: 5 };       // 跳開
    if (i === 200) world = world && world.slice(0, 20);                 // 點數不同
    t = i === 150 ? t - 50 : f.t;                                         // 時間倒退
    const a = o.process(world, t), b = w.process(world, t);
    n++;
    if (JSON.stringify(a) !== JSON.stringify(b)) bad++;
  });
}
console.log('格數', n, '不同', bad, bad ? '有差異' : '完全相同');
const d = makeDemoRecording({ depths: Array(60).fill(90) });
const fr = d.frames.filter(f => f.world).map(f => ({ t: f.t, w: f.world.map(([x, y, z]) => ({ x, y, z })) }));
for (const [name, C] of [['舊', O], ['新', N]]) { const s = new C(); const t0 = performance.now(); for (const f of fr) s.process(f.w, f.t); console.log(name, ((performance.now() - t0) / fr.length * 1000).toFixed(1), '微秒/格'); }
