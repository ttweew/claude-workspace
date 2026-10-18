// 以「正側面拍到的角度」當作正確答案（那就是動作本身在矢狀面的角度），看拍攝角度偏掉時誤差多大
import { squatPose, project, angle2 } from './body.mjs';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const knees = [180, 150, 120, 90, 70];
const yaws = [0, 10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90];
const J = { knee: ['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE'], hip: ['LEFT_SHOULDER', 'LEFT_HIP', 'LEFT_KNEE'] };
const ang = (p, j) => angle2(p[J[j][0]], p[J[j][1]], p[J[j][2]]);
console.log('yaw | r | 膝最大誤差 | 髖最大誤差');
for (const yaw of yaws) {
    let wk = 0, wh = 0, r = 0;
    for (const k of knees) {
        const { P } = squatPose({ knee: k, lean: (180 - k) * 0.4 });
        const side = project(P, 0), p = project(P, yaw);
        wk = Math.max(wk, Math.abs(ang(p, 'knee') - ang(side, 'knee')));
        wh = Math.max(wh, Math.abs(ang(p, 'hip') - ang(side, 'hip')));
        if (k === 180) r = (dist(p.LEFT_SHOULDER, p.RIGHT_SHOULDER) + dist(p.LEFT_HIP, p.RIGHT_HIP)) / (2 * dist(mid(p.LEFT_SHOULDER, p.RIGHT_SHOULDER), mid(p.LEFT_HIP, p.RIGHT_HIP)));
    }
    console.log(String(yaw).padStart(3), '|', r.toFixed(2), '|', wk.toFixed(1).padStart(5), '|', wh.toFixed(1).padStart(5));
}
