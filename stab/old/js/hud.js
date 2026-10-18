// 大字儀表板：站在 2～3 公尺外運動時，關節旁的小字看不清楚，改用畫面下方的大數字顯示
// 只顯示一側（膝蓋、髖部）：側面拍攝時，靠近鏡頭的那一側最準；正面拍攝時兩側差不多，選看得比較清楚的一側

import { P } from './landmarks.js';

const SWITCH_MARGIN = 0.4;  // 另一側要明顯比較清楚才換邊，避免數字在左右之間一直跳

// 一側的清楚程度：肩、髖、膝、踝的可信度加總
function sideScore(landmarks, side) {
    return ['SHOULDER', 'HIP', 'KNEE', 'ANKLE'].reduce((sum, k) => sum + landmarks[P[side + '_' + k]].visibility, 0);
}

export class Hud {
    // els：{ root, side, knee, hip } 畫面元素；兩個角度都算不出來時（例如太近、看不到腳）整個收起來
    constructor(els) {
        this.els = els;
        this.side = 'LEFT';
    }

    reset() {
        this.side = 'LEFT';
        this.show(null);
    }

    // landmarks：平滑後的 33 點；angles：computeAngles 的結果。沒有偵測到人時傳 null
    update(landmarks, angles) {
        if (!landmarks) {
            this.show(null);
            return;
        }
        const other = this.side === 'LEFT' ? 'RIGHT' : 'LEFT';
        if (sideScore(landmarks, other) > sideScore(landmarks, this.side) + SWITCH_MARGIN) this.side = other;
        this.show(angles);
    }

    show(angles) {
        const text = key => (angles && angles[key] !== null ? Math.round(angles[key]) + '°' : '—');
        setText(this.els.side, this.side === 'LEFT' ? '左側' : '右側');
        setText(this.els.knee, text(this.side + '_KNEE'));
        setText(this.els.hip, text(this.side + '_HIP'));
        const empty = !angles || (angles[this.side + '_KNEE'] === null && angles[this.side + '_HIP'] === null);
        if (this.els.root.classList.contains('empty') !== empty) this.els.root.classList.toggle('empty', empty);
    }
}

// 內容有變才更新，比較省電
function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}
