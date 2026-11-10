// 11/10 保養（彩排準備）：現場示範時「走到位置」「走回手機」那幾秒，AI 全自動會不會誤換動作
// 合成的骨架（示範動畫的火柴人改的，不是真人）：側面站、正面站、側面走過畫面、正面走向手機、正面走遠
// 用重播分析的 AI 全自動分段（auto-segments.js，和首頁同一套）一格一格跑，印出每 0.5 秒畫面上 AI 猜的動作、換了幾次、每一段幾下
// 用法：node walk_probe.mjs
const W = '/home/user/claude-workspace';
const { demoLandmarks } = await import(W + '/tests/helpers.mjs');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { ActivityMeter, ActivityDisplay } = await import(W + '/js/analysis/activity.js');
const { AutoSegmenter } = await import(W + '/js/analysis/auto-segments.js');
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

const ABBR = { stand: '站', squat: '蹲', pushup: '伏', plank: '棒', lunge: '弓' };
function analyse(name, list) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), seg = new AutoSegmenter();
    let line = '', lastCurrent = 'free';
    const events = [];
    for (const f of list) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        const g = meter.update(p, f.t);
        const shown = display.update(g);
        if (g !== undefined) line += shown ? (shown.label ? ABBR[shown.label] : '？') : '－';
        seg.update(p, f.t);
        if (seg.current !== lastCurrent) { events.push((f.t / 1000).toFixed(1) + ' 秒換成 ' + seg.current); lastCurrent = seg.current; }
    }
    const segs = seg.done().map(s => s.workout + ' ' + s.items.length + ' 下');
    console.log('【' + name + '】');
    console.log('  每 0.5 秒畫面上猜的：' + line);
    console.log('  AI 全自動：' + (events.length ? events.join('；') : '沒有換') + ' → 分段：' + (segs.join('、') || '（沒有）'));
}

const only = (s, fn) => { frames.length = 0; seconds(s, fn); return frames.slice(); };
analyse('側面站著 8 秒', only(8, () => vis(clone(BASE))));
analyse('正面站著 8 秒', only(8, () => front(1)));
analyse('正面站著、離近一點（1.5 倍）8 秒', only(8, () => front(1.5)));
analyse('側面走過畫面 4 秒（前面站 3 秒）', (() => { frames.length = 0; seconds(3, () => sideWalk(0)); seconds(4, t => sideWalk(t)); seconds(3, () => sideWalk(4)); return frames.slice(); })());
analyse('側面慢慢走 6 秒（前面站 3 秒）', (() => { frames.length = 0; seconds(3, () => sideWalk(0, { v: 0.12 })); seconds(6, t => sideWalk(t, { v: 0.12, f: 0.7 })); return frames.slice(); })());
analyse('正面走向手機 3 秒（前面站 3 秒）', (() => { frames.length = 0; seconds(3, () => front(1)); seconds(3, t => front(1 + 0.4 * t, { walk: t })); return frames.slice(); })());
analyse('正面走遠 3 秒，再站 5 秒', (() => { frames.length = 0; seconds(3, t => front(2.2 - 0.4 * t, { walk: t })); seconds(5, () => front(1)); return frames.slice(); })());

// 照現場示範：按開始後走到位置（正面走遠 3 秒）→ 正面站 2 秒 → 轉成側面站 3 秒 → 深蹲 5 下（第 4 下上身前傾）→ 站 2 秒 → 轉回正面走向手機 3 秒 → 沒有人 1 秒
frames.length = 0;
seconds(3, t => front(2.2 - 0.4 * t, { walk: t }));
seconds(2, () => front(1));
seconds(3, () => vis(clone(BASE)));
[0, 0, 0, 1, 0].forEach(b => squatRep(!!b));
seconds(2, () => vis(clone(BASE)));
seconds(3, t => front(1 + 0.4 * t, { walk: t }));
seconds(1, () => front(4));
analyse('現場示範（走遠→站→深蹲 5 下→走回手機）', frames.slice());

// 同上，但走到位置、走回手機都從側面走過畫面（最壞的情況）
frames.length = 0;
seconds(3, t => sideWalk(t, { x0: 0.0 }));
seconds(3, () => vis(clone(BASE)));
[0, 0, 0, 1, 0].forEach(b => squatRep(!!b));
seconds(2, () => vis(clone(BASE)));
seconds(4, t => sideWalk(t, { x0: HIP.x }));
analyse('現場示範，走路都從側面走過畫面', frames.slice());
