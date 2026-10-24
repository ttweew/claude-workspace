// 平衡與重心（10/24，研究目標 2）：身體的重心在腳上方的哪裡、站著時前後晃動多少
// 側面拍才算（正面拍看不出前後）；目前只顯示數字（鏡頭畫面、數據面板、重播分析），不判斷對錯：門檻要等更多人的資料
//
// 重心：身體各部位的重心照重量比例平均（2D，畫面上的座標）
//   各部位的重量比例、重心在哪裡：Winter《Biomechanics and Motor Control of Human Movement》（2009）表 4.1（Dempster 的資料）
//   遠的那一側看不到（被身體擋住）時，用近的那一側代替：側面拍時兩邊的手腳在畫面上幾乎重疊
// 重心在腳的哪裡：重心比腳踝往前多少（面向的方向），以小腿長為 100%（和腳跟離地、前膝超過腳尖一樣的單位）
//   10/20 實測檔試算過兩種：「腳跟 0%～腳尖 100%」換人、蹲低時很不穩（腳尖的點常被擋住、腳尖朝鏡頭時腳看起來很短，
//   教練影片算出幾百 %）；以腳踝和小腿長為準穩定很多（受測者 B 站著時每 3 秒的標準差 0.3～2%）
// 前後晃動：站直（兩膝都超過 160°，和腳跟離地取基準的站直一樣）最近 3 秒，重心位置的標準差

import { P, isVisible, clearerSide } from '../skeleton/landmarks.js';

// [近端, 遠端, 重量比例, 重心離近端多遠（近端到遠端的比例）]，左右各一份
// 前臂＋手合在一起：手的點（INDEX 等）常常看不到，Winter 的表也有「前臂＋手」這一項（重心在手肘到手腕的 0.682）
// 腳：腳踝到腳尖的中間；腳尖的點常被擋住，看不到時用腳踝（腳只佔 1.45%，差不到 0.1%）
const LIMBS = [
    ['SHOULDER', 'ELBOW', 0.028, 0.436],     // 上臂
    ['ELBOW', 'WRIST', 0.022, 0.682],        // 前臂＋手
    ['HIP', 'KNEE', 0.100, 0.433],           // 大腿
    ['KNEE', 'ANKLE', 0.0465, 0.433]         // 小腿
];
const FOOT = 0.0145;
const HEAD = 0.081;    // 頭＋脖子：重心在耳朵
const TRUNK = 0.497;   // 軀幹：髖到肩的中間
// 全部加起來是 1（tests/balance.test.mjs 檢查）
export const MASS_TOTAL = HEAD + TRUNK + 2 * (LIMBS.reduce((s, l) => s + l[2], 0) + FOOT);

export const BALANCE = {
    workouts: ['free', 'squat'],   // 兩腳踩在一起、站著做的才算：弓箭步兩腳前後分開、伏地挺身和棒式是手和腳撐著，要另外訂「腳」在哪裡
    standKnee: 160,                // 站直：兩膝都超過這個角度
    swayMs: 3000,                  // 前後晃動看最近 3 秒
    swayMinMs: 2500,               // 至少要站直 2.5 秒才算（剛站起來那一下不算）
    swayMinFrames: 10              // 至少 10 格（慢的手機每秒約 5 格）
};

// 看得到的點的平均位置（比例座標）；一個都看不到回傳 null
function mean(landmarks, names) {
    const seen = names.map(n => landmarks[P[n]]).filter(isVisible);
    if (!seen.length) return null;
    return { x: seen.reduce((s, p) => s + p.x, 0) / seen.length, y: seen.reduce((s, p) => s + p.y, 0) / seen.length };
}
const both = name => ['LEFT_' + name, 'RIGHT_' + name];

// 重心的位置（和 landmarks 一樣是 0～1 的比例座標）；頭、肩、髖、手臂、腿有一個部位兩邊都看不到就算不出來（回傳 null）
// 比例座標直接平均就好：換成像素是乘上寬、高，平均之後再乘結果一樣
export function centerOfMass(landmarks) {
    let x = 0, y = 0;
    const add = (p, m) => { x += p.x * m; y += p.y * m; };
    const head = mean(landmarks, both('EAR')) || mean(landmarks, ['NOSE']);
    const shoulder = mean(landmarks, both('SHOULDER')), hip = mean(landmarks, both('HIP'));
    if (!head || !shoulder || !hip) return null;
    add(head, HEAD);
    add({ x: (shoulder.x + hip.x) / 2, y: (shoulder.y + hip.y) / 2 }, TRUNK);
    for (const [a, b, m, r] of LIMBS) {
        const sides = ['LEFT', 'RIGHT'].filter(s => isVisible(landmarks[P[s + '_' + a]]) && isVisible(landmarks[P[s + '_' + b]]));
        if (!sides.length) return null;
        for (const s of sides) {
            const A = landmarks[P[s + '_' + a]], B = landmarks[P[s + '_' + b]];
            add({ x: A.x + (B.x - A.x) * r, y: A.y + (B.y - A.y) * r }, m * 2 / sides.length);
        }
    }
    const ankles = ['LEFT', 'RIGHT'].filter(s => isVisible(landmarks[P[s + '_ANKLE']]));
    if (!ankles.length) return null;
    for (const s of ankles) {
        const A = landmarks[P[s + '_ANKLE']], T = landmarks[P[s + '_FOOT_INDEX']];
        add(isVisible(T) ? { x: (A.x + T.x) / 2, y: (A.y + T.y) / 2 } : A, FOOT * 2 / ankles.length);
    }
    return { x: x / MASS_TOTAL, y: y / MASS_TOTAL };
}

// 這一格的重心和腳（pose：pipeline.js 的結果）；正面拍、看不出面向、看不到腳踝或小腿時回傳 null
// 回傳：{ x, y（重心，比例座標）, offset（重心比腳踝往前多少，小腿長 100%）,
//         heel, toe（腳跟、腳尖在哪裡，同樣的單位；看不到是 null）, heelX、toeX（腳跟、腳尖的 x，比例座標，畫腳底用）, floor（腳底的高度，比例座標）}
export function balanceOf(pose) {
    const view = pose && pose.view;
    if (!view || !view.facing || !(view.view === 'side' || view.view === 'oblique')) return null;
    const lm = pose.landmarks, W = pose.width, H = pose.height;
    const com = centerOfMass(lm);
    const ankle = mean(lm, both('ANKLE'));
    if (!com || !ankle) return null;
    // 小腿長：看得比較清楚的那一側，看不到換另一側
    const first = clearerSide(lm);
    const side = [first, first === 'LEFT' ? 'RIGHT' : 'LEFT'].find(s => isVisible(lm[P[s + '_KNEE']]) && isVisible(lm[P[s + '_ANKLE']]));
    if (!side) return null;
    const knee = lm[P[side + '_KNEE']], ak = lm[P[side + '_ANKLE']];
    const shank = Math.hypot((knee.x - ak.x) * W, (knee.y - ak.y) * H);
    if (!(shank >= 5)) return null;   // 小腿在畫面上不到 5 像素：人太遠或點疊在一起，算出來的 % 沒有意義
    const ahead = x => Math.round((x - ankle.x) * W * view.facing / shank * 1000) / 10;   // 比腳踝往前多少（%，取到小數第 1 位）
    const heel = mean(lm, both('HEEL')), toe = mean(lm, both('FOOT_INDEX'));
    const feet = [heel, toe, ...both('ANKLE').map(n => lm[P[n]]).filter(isVisible)].filter(Boolean);
    return {
        x: com.x, y: com.y,
        offset: ahead(com.x),
        heel: heel ? ahead(heel.x) : null,
        toe: toe ? ahead(toe.x) : null,
        heelX: heel ? heel.x : null,
        toeX: toe ? toe.x : null,
        floor: Math.max(...feet.map(p => p.y))
    };
}

const standing = pose => {
    const knees = [pose.angles.LEFT_KNEE, pose.angles.RIGHT_KNEE].filter(a => a !== null && a !== undefined);
    return knees.length > 0 && knees.every(a => a > BALANCE.standKnee);
};

// 一次運動的重心和前後晃動（鏡頭畫面、重播分析各用一個）
export class BalanceMeter {
    constructor() {
        this.reset();
    }

    reset() {
        this.window = [];   // 最近站直的格子：{ t, offset }
    }

    // pose：pipeline.js 的結果（沒有人時 null）；回傳 balanceOf 的結果再加上 sway（前後晃動，%；還不能算時 null），算不出重心時 null
    update(pose, timeMs) {
        const b = pose ? balanceOf(pose) : null;
        // 沒站直、算不出重心：前後晃動重新量（蹲下、走動不算晃動）
        if (!b || !standing(pose)) {
            this.window = [];
            return b ? { ...b, sway: null } : null;
        }
        this.window.push({ t: timeMs, offset: b.offset });
        while (timeMs - this.window[0].t > BALANCE.swayMs) this.window.shift();
        return { ...b, sway: this.sway() };
    }

    // 標準差（%，取到小數第 1 位）
    sway() {
        const w = this.window;
        if (w.length < BALANCE.swayMinFrames || w[w.length - 1].t - w[0].t < BALANCE.swayMinMs) return null;
        const m = w.reduce((s, v) => s + v.offset, 0) / w.length;
        return Math.round(Math.sqrt(w.reduce((s, v) => s + (v.offset - m) ** 2, 0) / w.length) * 10) / 10;
    }
}

// 給人看的位置：腳跟後面、腳跟～腳踝、腳踝～腳尖（腳掌）、腳尖前面
// 腳跟、腳尖看不到時只說比腳踝前面或後面
export function balanceText(b) {
    const where = b.heel !== null && b.offset < b.heel ? '腳跟後面'
        : b.toe !== null && b.offset > b.toe ? '腳尖前面'
        : b.offset >= 0 ? (b.toe !== null ? '腳掌上方' : '腳踝前面') : (b.heel !== null ? '腳跟上方' : '腳踝後面');
    return '重心在' + where + '（比腳踝' + (b.offset >= 0 ? '前 ' : '後 ') + Math.abs(b.offset).toFixed(1) + '%，小腿長 100%）';
}

// 數據面板、重播分析的一行：在腳的哪裡＋前後晃動；算不出來時說要怎麼拍
export function balanceLine(b) {
    if (!b) return '重心：—（要側面拍，看得到頭、肩、髖、手臂、腳踝）';
    return balanceText(b) + ' · 前後晃動 ' + (b.sway === null ? '—（站直不動 3 秒）' : b.sway.toFixed(1) + '%（最近 3 秒）');
}
