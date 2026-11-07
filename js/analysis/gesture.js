// 手勢控制（11/8）：站在 2～3 公尺外不用走回手機，舉起「一隻手」過頭 2 秒 → 開始（或結束）錄影
// AI 看骨架判斷：身體站直（不是趴著做伏地挺身、棒式）、一隻手腕比鼻子高出身體長度（肩膀中間到髖部中間）的 1/4 以上、
// 另一隻手腕在肩膀下面。為什麼要「只有一隻手」：做完一組兩手往上伸懶腰很常見，兩手一起舉不算，免得不小心開始錄影
// 舉著不動的期間每一格都要符合；中間放下（或 AI 漏掉這個人）就重來。觸發一次之後，手要先放下才會再觸發（一直舉著不會一直開關）
import { P, isVisible } from '../skeleton/landmarks.js';

export const HOLD_MS = 2000;        // 舉著 2 秒（站遠看得到畫面上的倒數，又不會太久）
export const SHOW_AFTER_MS = 500;   // 舉著 0.5 秒以上才在畫面上寫「再舉 1.5 秒」（手剛好經過頭頂不用提示）
const ABOVE = 0.25;                 // 手腕比鼻子高出身體長度的幾倍才算過頭
const UPRIGHT_DEG = 35;             // 身體和垂直線差 35° 以內算站著（深蹲蹲下去上身約 30°；趴著約 70～90°）
const MISS_MS = 300;                // AI 漏掉這個人不到 0.3 秒（一兩格）不算放下

const px = (q, w, h) => ({ x: q.x * w, y: q.y * h });
const seen = q => !!q && isVisible(q);

// 這一格是不是「站著、只舉一隻手過頭」：回傳舉的是哪一隻（'left'、'right'），不是時 null
// p：js/skeleton/pipeline.js 的結果 { landmarks, width, height }（沒有人時 null）
export function raisedHand(p) {
    if (!p || !Array.isArray(p.landmarks) || p.landmarks.length < 33) return null;
    const w = p.width > 0 ? p.width : 1, h = p.height > 0 ? p.height : 1;
    const lm = p.landmarks;
    const ids = [P.NOSE, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, P.LEFT_HIP, P.RIGHT_HIP];
    if (!ids.every(i => seen(lm[i]))) return null;
    const nose = px(lm[P.NOSE], w, h);
    const ls = px(lm[P.LEFT_SHOULDER], w, h), rs = px(lm[P.RIGHT_SHOULDER], w, h);
    const lh = px(lm[P.LEFT_HIP], w, h), rh = px(lm[P.RIGHT_HIP], w, h);
    const shoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    const body = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
    if (!(body > 0)) return null;
    // 站著：肩膀在髖部上面，身體和垂直線差不多（畫面的 y 往下）
    const tilt = Math.atan2(Math.abs(shoulder.x - hip.x), hip.y - shoulder.y) * 180 / Math.PI;
    if (!(tilt <= UPRIGHT_DEG)) return null;
    const wrist = side => (seen(lm[P[side + '_WRIST']]) ? px(lm[P[side + '_WRIST']], w, h) : null);
    const up = q => !!q && nose.y - q.y >= ABOVE * body;
    const down = q => !q || q.y > shoulder.y;   // 看不到的手當成放著（側面拍時另一隻手常被身體擋住）
    const l = wrist('LEFT'), r = wrist('RIGHT');
    if (up(l) && down(r)) return 'left';
    if (up(r) && down(l)) return 'right';
    return null;
}

// 一格一格餵進來：回傳 { holding（舉著幾毫秒，沒舉是 0）, fired（這一格剛好舉滿 2 秒） }
export class RaiseHand {
    constructor(holdMs = HOLD_MS) {
        this.holdMs = holdMs;
        this.reset();
    }

    reset() {
        this.since = null;      // 這次開始舉的時間
        this.lastSeen = null;   // 最後一格符合的時間
        this.armed = true;      // 觸發過要先放下才再觸發
    }

    update(p, timeMs) {
        const ok = typeof timeMs === 'number' && Number.isFinite(timeMs);
        if (!ok) return { holding: 0, fired: false };
        // 時間倒退：重新開始
        if (this.lastSeen !== null && timeMs < this.lastSeen) this.reset();
        const hand = raisedHand(p);
        if (!hand) {
            // AI 漏掉這個人一兩格（不到 0.3 秒）：不算放下，舉著的時間接著算
            const gap = !p && this.lastSeen !== null && timeMs - this.lastSeen <= MISS_MS;
            if (gap) return { holding: this.armed && this.since !== null ? timeMs - this.since : 0, fired: false };
            // 真的放下了（或人走了）：重新開始，也可以再觸發
            this.since = null;
            this.armed = true;
            return { holding: 0, fired: false };
        }
        this.lastSeen = timeMs;
        if (!this.armed) return { holding: 0, fired: false };
        if (this.since === null) this.since = timeMs;
        const holding = timeMs - this.since;
        if (holding >= this.holdMs) {
            this.armed = false;
            this.since = null;
            return { holding: this.holdMs, fired: true };
        }
        return { holding, fired: false };
    }
}
