// 「肢體太短」規則：合成資料擋掉的情況是不是真的誤差大；真實錄影站直時有沒有被誤擋
import { readFileSync } from 'fs';
const v = process.argv[2];
const { computeAngles } = await import(`./${v}/analysis/angles.js`);
const { squatPose, project, angle2 } = await import('../step3/body.mjs');
const { ViewTracker } = await import('/home/user/claude-workspace/js/analysis/view.js');
const { LANDMARKS, isVisible } = await import('/home/user/claude-workspace/js/skeleton/landmarks.js');
const W = 640, H = 480;
const toLm = p => LANDMARKS.map(([k]) => p[k] ? { x: p[k].x / W, y: p[k].y / H, z: 0, visibility: 0.99 } : { x: 0.5, y: 0.1, z: 0, visibility: 0.1 });
let blocked = 0, blockedBig = 0, bigShown = 0, total = 0, sideBlocked = 0;
for (let yaw = 0; yaw <= 90; yaw += 5) for (let knee = 60; knee <= 180; knee += 10) for (const leanK of [0.2, 0.4, 0.6]) for (const sl of [0.35, 0.45, 0.55]) {
  const flex = 180 - knee; const P = squatPose({ knee, lean: flex * leanK, shankLean: flex * sl }).P;
  const truth = angle2(...['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'].map(k => project(P, 0)[k]));
  const l = toLm(project(P, yaw, 150, 320, 420));
  const view = new ViewTracker().update(l, 1000, W, H).view;
  const a = computeAngles(l, W, H).LEFT_KNEE;
  // 不擋的話會給的角度
  const raw = angle2(...['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'].map(k => ({ x: l[LANDMARKS.findIndex(([n]) => n === k)].x * W, y: l[LANDMARKS.findIndex(([n]) => n === k)].y * H })));
  total++;
  if (a === null) { blocked++; if (Math.abs(raw - truth) > 30) blockedBig++; if (view === 'side') sideBlocked++; }
  else if (Math.abs(a - truth) > 30) bigShown++;
}
console.log(v, `合成 ${total} 組：擋掉 ${blocked}（其中誤差 >30° 的 ${blockedBig}）；沒擋到、誤差 >30° 的 ${bigShown}；側面被擋 ${sideBlocked}`);
for (const f of ['2ef82f59-pose_20261005_133933.json', 'e1f4647b-pose_20261005_134842.json']) {
  const d = JSON.parse(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/' + f, 'utf8'));
  let can = 0, got = 0, standCan = 0, standGot = 0;
  for (const fr of d.frames) {
    if (!fr.landmarks) continue;
    const l = fr.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
    if (![23, 25, 27].every(j => isVisible(l[j]))) continue;
    can++; const a = computeAngles(l, 480, 640).LEFT_KNEE; if (a !== null) got++;
    const r = angle2(...[23, 25, 27].map(j => ({ x: l[j].x * 480, y: l[j].y * 640 })));
    if (r > 165) { standCan++; if (a !== null) standGot++; }
  }
  console.log('  真實', f.slice(14, 29), `三點都看得到的格中給出左膝角度 ${(got / can * 100).toFixed(0)}%；站直（>165°）時 ${(standGot / standCan * 100).toFixed(0)}%`);
}
