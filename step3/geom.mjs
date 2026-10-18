import { squatPose, project, angle3, angle2, PROP } from './body.mjs';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
console.log('yaw = 拍攝角度（0 = 正側面、90 = 正面）；表格內是「畫面上的膝蓋角度 − 真實膝蓋角度」（左腿）');
const knees = [180, 150, 120, 90, 70];
const yaws = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
console.log('yaw | r 比值 |', knees.map(k => '膝' + k).join(' | '), '| 最大誤差 | 大腿縮短到');
for (const yaw of yaws) {
    const row = []; let worst = 0, r = 0, fmin = 1;
    for (const k of knees) {
        const { P } = squatPose({ knee: k, lean: (180 - k) * 0.4 });
        const p = project(P, yaw);
        const a2 = angle2(p.LEFT_HIP, p.LEFT_KNEE, p.LEFT_ANKLE);
        const a3 = angle3(P.LEFT_HIP, P.LEFT_KNEE, P.LEFT_ANKLE);
        row.push((a2 - a3).toFixed(0).padStart(4));
        worst = Math.max(worst, Math.abs(a2 - a3));
        if (k === 180) {
            const torso = dist(mid(p.LEFT_SHOULDER, p.RIGHT_SHOULDER), mid(p.LEFT_HIP, p.RIGHT_HIP));
            r = (dist(p.LEFT_SHOULDER, p.RIGHT_SHOULDER) + dist(p.LEFT_HIP, p.RIGHT_HIP)) / (2 * torso);
        }
        const thigh3 = PROP.thigh * 150;
        fmin = Math.min(fmin, dist(p.LEFT_HIP, p.LEFT_KNEE) / thigh3);
    }
    console.log(String(yaw).padStart(3), '|', r.toFixed(2), '|', row.join(' | '), '|', worst.toFixed(0).padStart(3), '° |', (fmin * 100).toFixed(0) + '%');
}
// 髖角度
console.log('\n髖角度誤差（肩－髖－膝）');
for (const yaw of yaws) {
    const row = []; let worst = 0;
    for (const k of knees) {
        const { P } = squatPose({ knee: k, lean: (180 - k) * 0.4 });
        const p = project(P, yaw);
        const e = angle2(p.LEFT_SHOULDER, p.LEFT_HIP, p.LEFT_KNEE) - angle3(P.LEFT_SHOULDER, P.LEFT_HIP, P.LEFT_KNEE);
        row.push(e.toFixed(0).padStart(4)); worst = Math.max(worst, Math.abs(e));
    }
    console.log(String(yaw).padStart(3), '|', row.join(' | '), '| 最大', worst.toFixed(0));
}
