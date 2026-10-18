// 個人校正：每個人站直的樣子不一樣、手機也不一定放正，開鏡頭後側身站直不動約 2 秒，網站自動記下：
//   1. 站直時的膝蓋角度：有人站直只有 165°（手機放得高、往下拍時膝蓋看起來會彎），
//      「站直」的門檻（深蹲、弓箭步 160°）就跟著降低，才不會站起來了還沒算這一下
//   2. 站直時上身和畫面垂直線的夾角：手機放歪時整個畫面都歪，上身看起來就是前傾的；
//      之後判斷「上身太前傾」時扣掉這個角度
// 不用另外按按鈕：做動作前本來就會先站好，網站趁那時候記下來；每次開鏡頭重新校正
// 只在側面、斜側面拍時校正（正面看不出膝蓋和上身前後彎）

import { P, isVisible, clearerSide } from '../skeleton/landmarks.js';

export const CALIBRATE = {
    holdMs: 1500,     // 站直不動要持續這麼久
    knee: 155,        // 膝蓋至少這麼直才算站著
    lean: 20,         // 上身和畫面垂直線差這麼多以內才算站直（手機歪超過 20° 就不校正）
    still: 0.015      // 這段時間肩、髖移動不超過畫面的 1.5% 才算不動
};

// 上身和畫面垂直線的夾角（度，有方向）：肩膀在髖部的右邊是正的；看不到時回傳 null
export function torsoAngle(pose, side) {
    const s = pose.landmarks[P[side + '_SHOULDER']], h = pose.landmarks[P[side + '_HIP']];
    if (!isVisible(s) || !isVisible(h)) return null;
    const dx = (s.x - h.x) * pose.width, dy = (h.y - s.y) * pose.height;
    if (dy <= 0) return null;   // 肩膀在髖部下面：不是站著
    return Math.atan2(dx, dy) * 180 / Math.PI;
}

const median = list => {
    const s = [...list].sort((a, b) => a - b);
    return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export class Calibrator {
    constructor() {
        this.reset();
    }

    reset() {
        this.baseline = null;   // { knee（站直時的膝蓋角度）, tilt（站直時上身和垂直線的夾角）}
        this.samples = [];
    }

    // 每一格；剛校正好的那一格回傳 baseline，其他時候回傳 null
    update(pose, timeMs) {
        if (this.baseline) return null;
        const sample = pose ? this.sample(pose) : null;
        if (!sample) {
            this.samples = [];
            return null;
        }
        // 移動太多（不是站著不動）：從這一格重新開始算
        const first = this.samples[0];
        if (first && (Math.abs(sample.cx - first.cx) > CALIBRATE.still || Math.abs(sample.cy - first.cy) > CALIBRATE.still)) this.samples = [];
        this.samples.push({ ...sample, t: timeMs });
        if (timeMs - this.samples[0].t < CALIBRATE.holdMs) return null;
        this.baseline = {
            knee: Math.round(median(this.samples.map(s => s.knee))),
            tilt: Math.round(median(this.samples.map(s => s.tilt)) * 10) / 10
        };
        this.samples = [];
        return this.baseline;
    }

    // 這一格能不能拿來校正：側面拍、站直（膝蓋夠直、上身接近垂直）
    sample(pose) {
        const view = pose.view && pose.view.view;
        if (view !== 'side' && view !== 'oblique') return null;
        const side = clearerSide(pose.landmarks);
        const knees = [pose.angles.LEFT_KNEE, pose.angles.RIGHT_KNEE].filter(a => a !== null && a !== undefined);
        if (!knees.length || Math.min(...knees) < CALIBRATE.knee) return null;
        const tilt = torsoAngle(pose, side);
        if (tilt === null || Math.abs(tilt) > CALIBRATE.lean) return null;
        const s = pose.landmarks[P[side + '_SHOULDER']], h = pose.landmarks[P[side + '_HIP']];
        return { knee: Math.max(...knees), tilt, cx: (s.x + h.x) / 2, cy: (s.y + h.y) / 2 };
    }
}

// 依校正結果調整「站直」的門檻：站直時的膝蓋角度比預設門檻 + 10° 還小，門檻就降到「站直角度 − 10°」
// 最低降到 145°；「有彎下去」的門檻要比站直至少低 15°
export function personalThresholds(config, baseline) {
    if (!baseline || !baseline.knee) return { up: config.up, down: config.down };
    const up = Math.max(145, Math.min(config.up, baseline.knee - 10));
    return { up, down: Math.min(config.down, up - 15) };
}
