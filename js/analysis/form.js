// 動作錯誤判斷：做動作時常見的錯誤，偵測到就把那段骨架標紅、畫面上方顯示紅字、用語音提醒
//
// 都是從側面看得出來的錯誤（網站要求側面拍）：
//   深蹲：上身太前傾、腳跟離地
//   伏地挺身、棒式：腰塌下去、屁股太高（肩、髖、腳踝沒有一直線）
//   弓箭步：上身前傾、前膝超過腳尖
// 膝蓋內夾、左右不平衡這類要正面才看得到，側面拍做不到，先不判斷
//
// 為了不誤報：錯誤要持續 0.4 秒才顯示，恢復 0.6 秒才收起來（偵測跳一格不會閃）；
// 只在動作進行中檢查（例如深蹲蹲下去時才看上身前傾，站直時不看）
// 門檻依一般健身教學訂的，要請組員實際做做看再調整（docs/roadmap.md）

import { P, isVisible, clearerSide } from '../skeleton/landmarks.js';
import { bodyTilt } from './reps.js';

export const FORM_HOLD = { showMs: 400, hideMs: 600 };

const pt = (pose, id) => ({ x: pose.landmarks[P[id]].x * pose.width, y: pose.landmarks[P[id]].y * pose.height });
const seen = (pose, ...ids) => ids.every(id => isVisible(pose.landmarks[P[id]]));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 上身和垂直線的夾角（度）：0 是上身直立，90 是上身水平；看不到肩或髖時回傳 null
// tilt：個人校正量到的「站直時上身和畫面垂直線的夾角」（手機放歪的角度，見 calibrate.js），先扣掉
export function torsoLean(pose, side, tilt = 0) {
    if (!seen(pose, side + '_SHOULDER', side + '_HIP')) return null;
    const s = pt(pose, side + '_SHOULDER'), h = pt(pose, side + '_HIP');
    if (h.y - s.y <= 0) return Math.atan2(Math.abs(s.x - h.x), Math.abs(s.y - h.y)) * 180 / Math.PI;
    return Math.abs(Math.atan2(s.x - h.x, h.y - s.y) * 180 / Math.PI - tilt);
}

// 身體一直線的程度：髖部離「肩到腳踝的直線」多遠，以這條線的長度為 1
// 正數：髖部在線的下面（腰塌下去）；負數：在線的上面（屁股翹起來）
// 約 0.07 是身體彎 16°、0.09 是彎 20°
export function hipSag(pose, side) {
    if (!seen(pose, side + '_SHOULDER', side + '_HIP', side + '_ANKLE')) return null;
    const s = pt(pose, side + '_SHOULDER'), h = pt(pose, side + '_HIP'), a = pt(pose, side + '_ANKLE');
    const len = dist(s, a);
    if (len < 1) return null;
    // 線的法向量，取 y 往下（畫面的下面）的那個方向
    let nx = -(a.y - s.y) / len, ny = (a.x - s.x) / len;
    if (ny < 0) { nx = -nx; ny = -ny; }
    return ((h.x - s.x) * nx + (h.y - s.y) * ny) / len;
}

// 腳跟離地：腳跟比腳尖高多少，以小腿長度為 1（平踩約 0，墊腳尖時明顯變大）
export function heelLift(pose, side) {
    if (!seen(pose, side + '_HEEL', side + '_FOOT_INDEX', side + '_KNEE', side + '_ANKLE')) return null;
    const shank = dist(pt(pose, side + '_KNEE'), pt(pose, side + '_ANKLE'));
    if (shank < 1) return null;
    return (pt(pose, side + '_FOOT_INDEX').y - pt(pose, side + '_HEEL').y) / shank;
}

// 弓箭步的前腳：面向的方向上，腳踝比較前面的那一腳；facing：1 面向畫面右邊、-1 左邊、0 看不出來
export function frontLeg(pose, facing) {
    if (!facing || !seen(pose, 'LEFT_ANKLE', 'RIGHT_ANKLE')) return null;
    return (pt(pose, 'LEFT_ANKLE').x - pt(pose, 'RIGHT_ANKLE').x) * facing >= 0 ? 'LEFT' : 'RIGHT';
}

// 前膝超過腳尖多少：面向的方向上，膝蓋比腳尖前面多少，以小腿長度為 1（沒超過是負數）
export function kneePastToe(pose, side, facing) {
    if (!facing || !seen(pose, side + '_KNEE', side + '_ANKLE', side + '_FOOT_INDEX')) return null;
    const knee = pt(pose, side + '_KNEE');
    const shank = dist(knee, pt(pose, side + '_ANKLE'));
    if (shank < 1) return null;
    return (knee.x - pt(pose, side + '_FOOT_INDEX').x) * facing / shank;
}

// 每一格先算好要用的數字，規則只要比門檻；phoneTilt：個人校正的手機傾斜角度
export function measure(pose, phoneTilt = 0) {
    const side = clearerSide(pose.landmarks);
    const facing = pose.view ? pose.view.facing : 0;
    const front = frontLeg(pose, facing);
    const knees = [pose.angles.LEFT_KNEE, pose.angles.RIGHT_KNEE].filter(a => a !== null && a !== undefined);
    const tilt = bodyTilt(pose.landmarks, pose.width, pose.height, side);
    return {
        side,
        lean: torsoLean(pose, side, phoneTilt),
        sag: hipSag(pose, side),
        heel: heelLift(pose, side),
        kneePast: front ? kneePastToe(pose, front, facing) : null,
        front,
        knee: knees.length ? Math.min(...knees) : null,
        lying: tilt !== null && tilt <= 45
    };
}

// 每個動作的規則：
//   text：畫面上的紅字；speech：語音唸的（短一點）；short：每一下的提示裡的簡稱；parts：要標紅的部位
//   active(m)：這個時候要不要檢查；bad(m)：是不是做錯了（數字算不出來時當作沒錯）
const gt = (v, limit) => v !== null && v > limit;
const lt = (v, limit) => v !== null && v < limit;
const PLANK_RULES = [
    { id: 'sag', short: '塌腰', text: '腰塌下去了，收緊腹部', speech: '收緊腹部', parts: ['torso', 'thigh'], active: m => m.lying, bad: m => gt(m.sag, 0.07) },
    { id: 'pike', short: '屁股太高', text: '屁股太高，身體要成一直線', speech: '屁股放低', parts: ['torso', 'thigh'], active: m => m.lying, bad: m => lt(m.sag, -0.09) }
];
export const FORM_RULES = {
    free: [],
    squat: [
        { id: 'lean', short: '上身前傾', text: '上身太前傾，胸口挺起來', speech: '胸口挺起來', parts: ['torso'], active: m => lt(m.knee, 130), bad: m => gt(m.lean, 50) },
        { id: 'heel', short: '腳跟離地', text: '腳跟離地了，重心放在腳跟', speech: '腳跟踩穩', parts: ['foot'], active: m => lt(m.knee, 150), bad: m => gt(m.heel, 0.25) }
    ],
    pushup: PLANK_RULES,
    plank: PLANK_RULES,
    lunge: [
        { id: 'lean', short: '上身前傾', text: '上身保持直立，不要往前倒', speech: '上身挺直', parts: ['torso'], active: m => lt(m.knee, 140), bad: m => gt(m.lean, 30) },
        { id: 'knee', short: '膝超過腳尖', text: '前膝超過腳尖了，步伐跨大一點', speech: '前膝不要超過腳尖', parts: ['frontShank'], active: m => lt(m.knee, 130), bad: m => gt(m.kneePast, 0.1) }
    ]
};

// 錯誤代號 → 簡稱（例如 lean → 上身前傾）；不同動作的同一個代號簡稱相同
const SHORT = {};
for (const rules of Object.values(FORM_RULES)) for (const r of rules) SHORT[r.id] = r.short;
export const errorShort = id => SHORT[id] || id;

// 部位 → 要標紅的骨架連線（33 點的編號）；side：看得比較清楚的那一側，front：弓箭步的前腳
export function redPairs(parts, m) {
    const pairs = [];
    const both = (a, b) => ['LEFT', 'RIGHT'].forEach(s => pairs.push([P[s + '_' + a], P[s + '_' + b]]));
    for (const part of parts) {
        if (part === 'torso') { both('SHOULDER', 'HIP'); pairs.push([P.LEFT_SHOULDER, P.RIGHT_SHOULDER], [P.LEFT_HIP, P.RIGHT_HIP]); }
        else if (part === 'thigh') both('HIP', 'KNEE');
        else if (part === 'foot') { both('ANKLE', 'HEEL'); both('HEEL', 'FOOT_INDEX'); both('ANKLE', 'FOOT_INDEX'); }
        else if (part === 'frontShank' && m.front) pairs.push([P[m.front + '_KNEE'], P[m.front + '_ANKLE']], [P[m.front + '_ANKLE'], P[m.front + '_FOOT_INDEX']]);
    }
    return pairs;
}

// 每一格更新；錯誤要持續 showMs 才顯示、恢復 hideMs 才收起來
export class FormChecker {
    constructor(workoutId) {
        this.rules = FORM_RULES[workoutId] || [];
        this.reset();
    }

    reset() {
        this.states = new Map(this.rules.map(r => [r.id, { badSince: null, goodSince: null, shown: false }]));
        this.last = null;
        this.tilt = 0;   // 個人校正的手機傾斜角度（tracker.js 校正好之後設定）
    }

    // pose：pipeline.process 的結果（沒有人時為 null）
    // 回傳 { errors（現在顯示中的規則）, started（這一格剛出現的規則，要唸出來）, red（要標紅的連線）, m（量到的數字） }
    update(pose, timeMs) {
        const out = { errors: [], started: [], red: [], m: null };
        if (!pose || !this.rules.length) {
            if (!pose) this.reset();
            return out;
        }
        const m = measure(pose, this.tilt);
        out.m = m;
        for (const rule of this.rules) {
            const st = this.states.get(rule.id);
            const bad = rule.active(m) && rule.bad(m);
            if (bad) {
                st.goodSince = null;
                if (st.badSince === null) st.badSince = timeMs;
                if (!st.shown && timeMs - st.badSince >= FORM_HOLD.showMs) {
                    st.shown = true;
                    out.started.push(rule);
                }
            } else {
                st.badSince = null;
                if (st.shown) {
                    if (st.goodSince === null) st.goodSince = timeMs;
                    if (timeMs - st.goodSince >= FORM_HOLD.hideMs) st.shown = false;
                }
            }
            if (st.shown) {
                out.errors.push(rule);
                out.red.push(...redPairs(rule.parts, m));
            }
        }
        return out;
    }
}
