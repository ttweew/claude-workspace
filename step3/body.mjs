// 合成 3D 骨架：比例取自 MediaPipe 在真人正面照片上的輸出（軀幹長 = 1）
// 座標：x 右、y 上、z 朝向鏡頭；人面向 +x（側面、往右）時 yaw = 0；yaw = 90 代表正面對鏡頭
export const PROP = { shoulderW: 0.64, hipW: 0.38, thigh: 0.8, shank: 0.8, ua: 0.55, fa: 0.5, ankleH: 0.13, heel: 0.1, toe: 0.3, head: 0.35 };
const rad = d => d * Math.PI / 180;
// knee：膝蓋角度（180 = 伸直）；lean：軀幹前傾（度）；hipExt：髖往後伸（度，弓箭步後腳用）
// armFwd：手臂往前抬的角度（0 = 垂下）
export function squatPose({ knee = 180, lean = 0, armFwd = 0, shankLean = null } = {}) {
    // 側面 2D（前 = +f，上 = +u）先算一條腿：踝固定，小腿前傾 β，大腿再往後
    const flex = 180 - knee;
    const beta = shankLean !== null ? shankLean : flex * 0.45;  // 小腿前傾大約是膝彎的一半
    const ankle = [0, PROP.ankleH];
    const kneeP = [ankle[0] + Math.sin(rad(beta)) * PROP.shank, ankle[1] + Math.cos(rad(beta)) * PROP.shank];
    const thighDir = rad(beta - flex);  // 大腿相對垂直的角度（負 = 往後）
    const hip = [kneeP[0] + Math.sin(thighDir) * PROP.thigh, kneeP[1] + Math.cos(thighDir) * PROP.thigh];
    const sh = [hip[0] + Math.sin(rad(lean)) * 1, hip[1] + Math.cos(rad(lean)) * 1];
    const elbow = [sh[0] + Math.sin(rad(armFwd)) * PROP.ua, sh[1] - Math.cos(rad(armFwd)) * PROP.ua];
    const wrist = [elbow[0] + Math.sin(rad(armFwd)) * PROP.fa, elbow[1] - Math.cos(rad(armFwd)) * PROP.fa];
    const nose = [sh[0] + Math.sin(rad(lean)) * PROP.head + 0.12, sh[1] + Math.cos(rad(lean)) * PROP.head];
    const ear = [sh[0] + Math.sin(rad(lean)) * PROP.head - 0.02, sh[1] + Math.cos(rad(lean)) * PROP.head];
    const toe = [ankle[0] + PROP.toe, 0.02], heel = [ankle[0] - PROP.heel, 0.02];
    // 3D：f → x，u → y，左右 → z（左邊 z 為正：人面向 +x 時，左手在靠鏡頭那側… 這裡只是對稱展開）
    const P = {};
    const put = (name, p, side, half) => { P[name] = [p[0], p[1], side * half]; };
    for (const [s, k] of [[1, 'LEFT'], [-1, 'RIGHT']]) {
        put(k + '_SHOULDER', sh, s, PROP.shoulderW / 2);
        put(k + '_ELBOW', elbow, s, PROP.shoulderW / 2);
        put(k + '_WRIST', wrist, s, PROP.shoulderW / 2);
        put(k + '_HIP', hip, s, PROP.hipW / 2);
        put(k + '_KNEE', kneeP, s, PROP.hipW / 2 + 0.03);
        put(k + '_ANKLE', ankle, s, PROP.hipW / 2 + 0.03);
        put(k + '_HEEL', heel, s, PROP.hipW / 2 + 0.03);
        put(k + '_FOOT_INDEX', toe, s, PROP.hipW / 2 + 0.06);
        put(k + '_EAR', ear, s, 0.08);
    }
    P.NOSE = [nose[0], nose[1], 0];
    return { P, trueKnee: knee, trueHip: 180 - flex + beta - lean + 0 /* 下面另外算 */ };
}
// 繞垂直軸轉 yaw 度後，正投影到畫面（畫面 x 右、y 下），scale：軀幹在畫面上的像素長
export function project(P, yaw, scale = 150, cx = 320, cy = 400) {
    const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
    const out = {};
    for (const [k, [x, y, z]] of Object.entries(P)) {
        const X = x * c - z * s;  // 轉完之後的畫面左右
        out[k] = { x: cx + X * scale, y: cy - y * scale, z: 0, visibility: 1 };
    }
    return out;
}
export function angle3(a, b, c) {
    const u = a.map((v, i) => v - b[i]), w = c.map((v, i) => v - b[i]);
    const d = u.reduce((s, v, i) => s + v * w[i], 0) / (Math.hypot(...u) * Math.hypot(...w));
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
export function angle2(a, b, c) {
    const u = [a.x - b.x, a.y - b.y], w = [c.x - b.x, c.y - b.y];
    const d = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w));
    return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
