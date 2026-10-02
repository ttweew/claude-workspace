// 拍攝方向與面向：判斷鏡頭是從側面還是正面拍，以及人面向畫面的左邊還是右邊
//
// 為什麼需要：關節角度用畫面上的 2D 座標計算，深蹲、伏地挺身這類「前後彎」的動作要從側面拍才準。
// 用 3D 合成骨架模擬（詳見 docs/data-format.md「拍攝方向」），深蹲時拍攝角度偏離正側面：
//   20° 以內 → 膝蓋角度誤差 4° 以內；30° → 9°；40° → 16°；正面拍 → 誤差可能超過 100°
//
// 怎麼判斷：肩寬＋髖寬 與 軀幹長度 的比值
//   正側面時左右肩、左右髖幾乎重疊，比值接近 0；越轉向正面，肩寬、髖寬在畫面上越寬
//   真人正面照片實測比值約 0.5；轉 20° 約 0.17、30° 約 0.26
//   軀幹前傾、深蹲時軀幹長度在側面畫面上不會變短，所以比值不受動作影響

import { P, isVisible } from './landmarks.js';

const SIDE_BELOW = 0.2;      // 比值小於這個 → 側面（拍攝角度約 25° 以內）
const OBLIQUE_BELOW = 0.3;   // 小於這個 → 斜側面（約 35° 以內）；再大 → 正面
const MARGIN = 0.03;         // 換類別要超過門檻這麼多，比值在門檻附近時才不會一直跳
const SMOOTH_MS = 300;       // 比值的平滑時間
const FACING_MIN = 0.08;     // 面向的證據（以軀幹長度為 1）至少要這麼明顯，否則算看不出來
const RESET_AFTER_MS = 500;

export const VIEW_NAMES = { side: '側面', oblique: '斜側面', front: '正面' };

// 肩寬＋髖寬 與 軀幹長度 的比值；四個點有任何一個看不到就回傳 null
export function viewRatio(landmarks, width, height) {
    const ids = [P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_HIP, P.RIGHT_HIP];
    if (!ids.every(i => isVisible(landmarks[i]))) return null;
    const [ls, rs, lh, rh] = ids.map(i => ({ x: landmarks[i].x * width, y: landmarks[i].y * height }));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const torso = dist({ x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 });
    if (torso < 1) return null;
    return (dist(ls, rs) + dist(lh, rh)) / (2 * torso);
}

// 面向：人面向畫面右邊回傳 1、左邊回傳 -1，看不出來回傳 0（例如正面拍）
// 證據：鼻子在耳朵前面、腳尖在腳跟前面。以軀幹長度為單位，人站遠站近都一樣
// 注意：這是「鏡頭原始畫面」的左右；前鏡頭在螢幕上有鏡像，畫面上看起來會相反
export function facingScore(landmarks, width, height) {
    const pt = i => ({ x: landmarks[i].x * width, y: landmarks[i].y * height });
    const seen = (...ids) => ids.every(i => isVisible(landmarks[i]));
    if (!seen(P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_HIP, P.RIGHT_HIP)) return 0;
    const sc = { x: (pt(P.LEFT_SHOULDER).x + pt(P.RIGHT_SHOULDER).x) / 2, y: (pt(P.LEFT_SHOULDER).y + pt(P.RIGHT_SHOULDER).y) / 2 };
    const hc = { x: (pt(P.LEFT_HIP).x + pt(P.RIGHT_HIP).x) / 2, y: (pt(P.LEFT_HIP).y + pt(P.RIGHT_HIP).y) / 2 };
    const torso = Math.hypot(sc.x - hc.x, sc.y - hc.y);
    if (torso < 1) return 0;
    let sum = 0, count = 0;
    // 鼻子 vs 看得到的耳朵
    const ears = [P.LEFT_EAR, P.RIGHT_EAR].filter(i => isVisible(landmarks[i]));
    if (isVisible(landmarks[P.NOSE]) && ears.length) {
        const earX = ears.reduce((s, i) => s + pt(i).x, 0) / ears.length;
        sum += (pt(P.NOSE).x - earX) / torso;
        count++;
    }
    // 腳尖 vs 腳跟（兩隻腳各算一次）
    for (const [toe, heel] of [[P.LEFT_FOOT_INDEX, P.LEFT_HEEL], [P.RIGHT_FOOT_INDEX, P.RIGHT_HEEL]]) {
        if (seen(toe, heel)) {
            sum += (pt(toe).x - pt(heel).x) / torso;
            count++;
        }
    }
    return count ? sum / count : 0;
}

// 每一格更新一次，回傳 { view: 'side' | 'oblique' | 'front' | null, ratio, facing: 1 | -1 | 0 }
// 比值先平滑再分類，而且有緩衝區，畫面上的文字不會一直跳
export class ViewTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.ratio = null;
        this.view = null;
        this.facing = 0;
        this.lastTime = null;  // 上一格的時間；null 代表還沒有上一格（時間 0 也是正常的一格，重播檔就是從 0 開始）
    }

    update(landmarks, timeMs, width, height) {
        if (!landmarks || (this.lastTime !== null && (timeMs - this.lastTime > RESET_AFTER_MS || timeMs <= this.lastTime))) this.reset();
        if (!landmarks) return this.state();
        const dt = this.lastTime !== null ? timeMs - this.lastTime : 0;
        this.lastTime = timeMs;
        const r = viewRatio(landmarks, width, height);
        if (r !== null) {
            this.ratio = this.ratio === null ? r : this.ratio + (1 - Math.exp(-dt / SMOOTH_MS)) * (r - this.ratio);
            this.view = classify(this.ratio, this.view);
        }
        // 正面拍時看不出面向；側面、斜側面才判斷
        if (this.view === 'side' || this.view === 'oblique') {
            const score = facingScore(landmarks, width, height);
            if (Math.abs(score) >= FACING_MIN) this.facing = Math.sign(score);
            else if (Math.abs(score) < FACING_MIN / 2) this.facing = 0;
        } else {
            this.facing = 0;
        }
        return this.state();
    }

    state() {
        return { view: this.view, ratio: this.ratio, facing: this.facing };
    }
}

// 分類：目前是哪一類，就要明顯越過門檻（MARGIN）才換
function classify(ratio, current) {
    const plain = ratio < SIDE_BELOW ? 'side' : ratio < OBLIQUE_BELOW ? 'oblique' : 'front';
    if (!current || plain === current) return plain;
    const shifted = r => (r < SIDE_BELOW ? 'side' : r < OBLIQUE_BELOW ? 'oblique' : 'front');
    // 往正面方向換：比值要再大 MARGIN；往側面方向換：要再小 MARGIN
    const order = { side: 0, oblique: 1, front: 2 };
    const toward = order[plain] > order[current] ? shifted(ratio - MARGIN) : shifted(ratio + MARGIN);
    return toward === plain ? plain : current;
}
