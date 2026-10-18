import { PoseSmoother } from '/home/user/claude-workspace/js/skeleton/smooth.js';
import { GhostFilter } from '/home/user/claude-workspace/js/skeleton/ghost.js';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const pose = (n, f = i => ({ x: 0.5 + i * 0.001, y: 0.5, z: 0, visibility: 0.9 })) => Array.from({ length: n }, (_, i) => f(i));

// 1. NaN 在中間一格：之後恢復正常
{
  const s = new PoseSmoother(); let t = 0; let out;
  for (let k = 0; k < 10; k++) out = s.smooth(pose(33), t += 33);
  const bad = pose(33); bad[5] = { x: NaN, y: Infinity, z: NaN, visibility: NaN };
  out = s.smooth(bad, t += 33);
  ok(Number.isFinite(out[5].x) && Number.isFinite(out[5].y) && Number.isFinite(out[5].visibility), 'NaN 那一格沿用上一個值：' + JSON.stringify(out[5]));
  for (let k = 0; k < 3; k++) out = s.smooth(pose(33), t += 33);
  ok(Math.abs(out[5].x - 0.505) < 1e-6 && Math.abs(out[5].visibility - 0.9) < 1e-6, 'NaN 之後恢復正常：x=' + out[5].x + ' vis=' + out[5].visibility);
}
// 2. 第一格就是 NaN（初始化那格）：之後不會永遠壞掉
{
  const s = new PoseSmoother(); let t = 0;
  const bad = pose(33); bad[0] = { x: NaN, y: NaN, z: NaN, visibility: NaN };
  let out = s.smooth(bad, t += 33);
  ok(Number.isNaN(out[0].x), '第一格 NaN 原樣傳回（不是 null）');
  out = s.smooth(pose(33), t += 33);
  out = s.smooth(pose(33), t += 33);
  ok(Number.isFinite(out[0].x) && Number.isFinite(out[0].visibility), '第一格 NaN 之後恢復：' + JSON.stringify(out[0]));
}
// 3. 第二格才 NaN（濾波器還沒有值）
{
  const s = new PoseSmoother(); let t = 0;
  s.smooth(pose(33), t += 33);
  const bad = pose(33); bad[3].x = NaN;
  let out = s.smooth(bad, t += 33);
  ok(Number.isNaN(out[3].x), '濾波器還沒值時 NaN 原樣傳回');
  out = s.smooth(pose(33), t += 33);
  ok(Math.abs(out[3].x - 0.503) < 1e-9, '下一格恢復：' + out[3].x);
}
// 4. 點數改變
{
  const s = new PoseSmoother(); let t = 0;
  for (let k = 0; k < 5; k++) s.smooth(pose(33), t += 33);
  let out, err = null;
  try { out = s.smooth(pose(35), t += 33); } catch (e) { err = e; }
  ok(!err && out.length === 35 && out.every(p => Number.isFinite(p.x)), '33 → 35 點不出錯：' + (err && err.message));
  try { out = s.smooth(pose(17), t += 33); } catch (e) { err = e; }
  ok(!err && out.length === 17 && out.every(p => Number.isFinite(p.x)), '35 → 17 點不出錯');
  // 原本會發生的事：17 點時 filters 還是 35 個 → 沒出錯但下一次 33 點時 filters[33] 不存在
}
// 5. Ghost 點數改變
{
  const g = new GhostFilter(); let t = 0; let err = null;
  const full = () => pose(33, i => ({ x: 0.3 + (i % 5) * 0.1, y: 0.2 + Math.floor(i / 5) * 0.1, z: 0, visibility: 0.95 }));
  for (let k = 0; k < 6; k++) g.update(full(), t += 33, 640, 480);
  const more = full().concat([{ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }, { x: 0.5, y: 0.5, z: 0, visibility: 0.95 }]);
  try { g.update(more, t += 33, 640, 480); } catch (e) { err = e; }
  ok(!err && more[34].visible === false, 'Ghost 33 → 35 點不出錯，新的點先不畫（要穩定 80ms）');
  for (let k = 0; k < 4; k++) g.update(more, t += 33, 640, 480);
  ok(more[34].visible === true, 'Ghost 新點穩定後畫出');
}
// 6. 正常情況：與修改前完全相同（用舊版比對）
{
  const { PoseSmoother: Old } = await import('./smooth_old.mjs');
  const a = new PoseSmoother(), b = new Old(); let t = 0, maxd = 0;
  for (let k = 0; k < 300; k++) {
    t += 30 + (k % 7);
    const frame = pose(33, i => ({ x: 0.5 + 0.2 * Math.sin(k / 10 + i), y: 0.5 + 0.1 * Math.cos(k / 7), z: 0.01 * i, visibility: 0.5 + 0.4 * Math.sin(k / 5 + i) }));
    const pa = a.smooth(frame, t), pb = b.smooth(frame, t);
    pa.forEach((p, i) => { for (const key of ['x', 'y', 'z', 'visibility']) maxd = Math.max(maxd, Math.abs(p[key] - pb[i][key])); });
  }
  ok(maxd === 0, '正常資料與修改前輸出完全相同（最大差 ' + maxd + '）');
}
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
