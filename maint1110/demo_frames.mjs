// 11/10 保養（彩排準備）：現場示範的合成骨架（示範動畫的火柴人改的，不是真人）
// 側面站、正面站（面向或背對鏡頭）、側面走過畫面、正面走向手機／走遠；照現場示範排好的一整段（demoScript）
const W = '/home/user/claude-workspace';
const { demoLandmarks } = await import(W + '/tests/helpers.mjs');
const { P } = await import(W + '/js/skeleton/landmarks.js');
const FPS = 30;
const BASE = demoLandmarks('squat', 0);           // 側面站直（面向畫面右邊）
const HIP = { x: BASE[P.LEFT_HIP].x, y: BASE[P.LEFT_HIP].y };
const clone = lm => lm.map(p => ({ ...p }));
const vis = lm => lm.map(p => ({ ...p, visibility: p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ? 0.1 : 0.99 }));
const UPPER = new Set([P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_ELBOW, P.RIGHT_ELBOW, P.LEFT_WRIST, P.RIGHT_WRIST,
    P.LEFT_EAR, P.RIGHT_EAR, P.LEFT_EYE, P.RIGHT_EYE, P.LEFT_EYE_INNER, P.RIGHT_EYE_INNER, P.LEFT_EYE_OUTER, P.RIGHT_EYE_OUTER,
    P.MOUTH_LEFT, P.MOUTH_RIGHT, P.LEFT_PINKY, P.RIGHT_PINKY, P.LEFT_INDEX, P.RIGHT_INDEX, P.LEFT_THUMB, P.RIGHT_THUMB].filter(k => k !== undefined));

// 側面走路：t 秒、往右走（v：每秒走過畫面寬的多少）；兩腳前後交替（一步最大分開 2A），膝蓋微彎，髖部上下一點點
function sideWalk(t, { v = 0.25, A = 0.12, f = 0.9, x0 = 0.2 } = {}) {
    const lm = clone(BASE), ph = 2 * Math.PI * f * t, s = Math.sin(ph);
    const dx = x0 + v * t - HIP.x, bob = -0.006 * Math.abs(Math.cos(ph));
    for (const p of lm) { p.x += dx; p.y += bob; }
    const leg = (side, sign) => {
        const hip = lm[P[side + '_HIP']], off = sign * A * s;
        const ank = lm[P[side + '_ANKLE']]; ank.x = hip.x + off + 0.01;
        const lift = Math.max(0, sign * Math.cos(ph)) * 0.02;          // 擺動的那隻腳抬起來一點
        ank.y = BASE[P.LEFT_ANKLE].y + bob - lift;
        const knee = lm[P[side + '_KNEE']];
        knee.x = (hip.x + ank.x) / 2 + 0.012 + lift; knee.y = (hip.y + ank.y) / 2;
        const heel = lm[P[side + '_HEEL']]; heel.x = ank.x - 0.014; heel.y = ank.y + 0.009;
        const toe = lm[P[side + '_FOOT_INDEX']]; toe.x = ank.x + 0.053; toe.y = ank.y;
    };
    leg('LEFT', 1); leg('RIGHT', -1);
    for (const [side, sign] of [['LEFT', -1], ['RIGHT', 1]]) {       // 手和腳反方向擺
        lm[P[side + '_ELBOW']].x += sign * 0.03 * s; lm[P[side + '_WRIST']].x += sign * 0.06 * s;
    }
    return vis(lm);
}

// 正面（面向鏡頭或背對鏡頭）：側面站姿的高度，左右分開；scale：離鏡頭越近越大（以髖部為中心放大）；
// 走路時前面那隻腳在畫面上低一點、膝蓋彎一點
const HALF = { SHOULDER: 0.06, ELBOW: 0.075, WRIST: 0.075, HIP: 0.035, KNEE: 0.035, ANKLE: 0.04, HEEL: 0.04, FOOT_INDEX: 0.045, EAR: 0.02, EYE: 0.012 };
function front(scale, { walk = null, cx = 0.5, cy = 0.5 } = {}) {
    const lm = clone(BASE);
    for (const [name, k] of Object.entries(P)) {
        if (typeof k !== 'number' || !lm[k]) continue;
        const m = name.match(/^(LEFT|RIGHT)_(.*)$/);
        let x = HIP.x;                                                 // 先放在身體中線
        if (m) {
            const part = Object.keys(HALF).find(h => m[2] === h || m[2].startsWith(h));
            if (part) x = HIP.x + (m[1] === 'LEFT' ? 1 : -1) * HALF[part];
        }
        let y = BASE[k].y;
        if (walk !== null && m && /KNEE|ANKLE|HEEL|FOOT/.test(m[2])) {
            const s = Math.sin(2 * Math.PI * 0.9 * walk) * (m[1] === 'LEFT' ? 1 : -1);
            y += (/KNEE/.test(m[2]) ? 0.012 : 0.025) * s;                 // 前面那隻腳近鏡頭：畫面上低一點
        }
        lm[k].x = cx + scale * (x - HIP.x);
        lm[k].y = cy + scale * (y - HIP.y);
    }
    return vis(lm);
}

const lean = lm => lm.map((p, k) => (UPPER.has(k) ? { ...p, x: p.x + 0.09 } : p));
const frames = [];
const push = lm => frames.push({ t: Math.round(frames.length * 1000 / FPS), raw: lm });
const seconds = (s, fn) => { const n = Math.round(s * FPS); for (let i = 0; i < n; i++) push(fn(i / FPS)); };
const squatRep = (bad = false) => {   // 和 harness 的 rep('squat', { hold: 15, rest: 40 }) 一樣排
    const add = d => push(bad ? lean(demoLandmarks('squat', d)) : demoLandmarks('squat', d));
    for (let i = 0; i <= 30; i++) add(i / 30);
    for (let i = 0; i < 15; i++) add(1);
    for (let i = 0; i <= 30; i++) add(1 - i / 30);
    for (let i = 0; i < 40; i++) push(demoLandmarks('squat', 0));
};


export { FPS, BASE, HIP, clone, vis, sideWalk, front, lean, frames, push, seconds, squatRep };
// 和 tests/browser/harness.mjs 一樣的格式（假 AI 播的）
export const encode = lm => lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]);
// 照現場示範排的一整段：按開始後走到位置（背對鏡頭走遠 3 秒）→ 正面站 2 秒 → 轉成側面站 3 秒 → 深蹲 5 下（bad：哪幾下上身前傾，預設第 4 下）
//   → 站 2 秒 → 轉回正面走向手機 3 秒 → 太近（只拍到一部分）1 秒；回傳 { list（每一格的骨架）, squatStart（第一下開始的格子）}
export function demoScript(bad = [0, 0, 0, 1, 0]) {
    frames.length = 0;
    seconds(3, t => front(2.2 - 0.4 * t, { walk: t }));
    seconds(2, () => front(1));
    seconds(3, () => vis(clone(BASE)));
    const squatStart = frames.length;
    bad.forEach(b => squatRep(!!b));
    seconds(2, () => vis(clone(BASE)));
    seconds(3, t => front(1 + 0.4 * t, { walk: t }));
    seconds(1, () => front(4));
    return { list: frames.map(f => f.raw), squatStart };
}
