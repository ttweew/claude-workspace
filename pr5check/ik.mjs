// 調整弓箭步、伏地挺身的姿勢參數：印出關節位置和角度
const L = { thigh: 42, shank: 43, torso: 46, upper: 30, fore: 28 };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function ik(a, c, l1, l2, pickLargerX) {
    const d = Math.min(dist(a, c), l1 + l2 - 1e-6);
    const t = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const k = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
    const p1 = [a[0] + l1 * Math.cos(t + k), a[1] + l1 * Math.sin(t + k)];
    const p2 = [a[0] + l1 * Math.cos(t - k), a[1] + l1 * Math.sin(t - k)];
    return (p1[0] > p2[0]) === pickLargerX ? p1 : p2;
}
const ang = (a, b, c) => { const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]]; return Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2)) * 180 / Math.PI; };
const f = p => p.map(v => v.toFixed(1)).join(',');
const [F, B] = [[150, 158], [JSON.parse(process.argv[2] || '64'), JSON.parse(process.argv[3] || '146')]];
for (const [name, hip] of [['top', [104, 88]], ['bottom', [108, 115]]]) {
    const kf = ik(hip, F, L.thigh, L.shank, true), kb = ik(hip, B, L.thigh, L.shank, true);
    console.log('弓箭步', name, '前膝', f(kf), ang(hip, kf, F).toFixed(0), '後膝', f(kb), ang(hip, kb, B).toFixed(0));
}
const A = [44, 150], W = [170, 158];
for (const th of [22, 14.5]) {
    const r = th * Math.PI / 180, S = [A[0] + 131 * Math.cos(r), A[1] - 131 * Math.sin(r)];
    const e = ik(S, W, L.upper, L.fore, false);
    console.log('伏地挺身', th, '肩', f(S), '肘', f(e), ang(S, e, W).toFixed(0), '距離', dist(S, W).toFixed(1));
}
