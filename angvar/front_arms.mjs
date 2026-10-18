// 正面深蹲（手往前伸）：有沒有擋掉大腿朝鏡頭的格子
const v = process.argv[2];
const { computeAngles } = await import(`./${v}/analysis/angles.js`);
const { makeDemoRecording } = await import('/home/user/claude-workspace/js/data/synth.js');
let blocked = 0, deep = 0;
for (const yaw of [75, 80, 85, 90]) for (const depth of [60, 70, 80, 90]) {
  const rec = makeDemoRecording({ yaw, depths: [depth], lead: 0.5 });
  for (const f of rec.frames) { if (!f.landmarks) continue; const l = f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })); const a = computeAngles(l, 640, 480).LEFT_KNEE; }
  // 最低點那一格
  const mid = rec.frames[Math.round(rec.frames.length / 2) - 8];
  const a = computeAngles(mid.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })), 640, 480).LEFT_KNEE;
  deep++; if (a === null) blocked++;
}
console.log(v, `正面深蹲最低點（16 組）擋掉 ${blocked}`);
