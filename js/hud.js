// 大字儀表板：站在 2～3 公尺外運動時，關節旁的小字看不清楚，改用畫面下方的大數字顯示
// 只顯示一側（膝蓋、髖部）：側面拍攝時，靠近鏡頭的那一側最準；正面拍攝時兩側差不多，選看得比較清楚的一側

import { clearerSide } from './landmarks.js';

export class Hud {
    // els：{ root, kneeName, knee, hipName, hip } 畫面元素；兩個角度都算不出來時（例如太近、看不到腳）整個收起來
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
        this.side = clearerSide(landmarks, this.side);
        this.show(angles);
    }

    show(angles) {
        const text = key => (angles && angles[key] !== null ? Math.round(angles[key]) + '°' : '—');
        // 名稱直接帶左右（左膝、右髖），比另外一個「左側」小標籤好認
        const side = this.side === 'LEFT' ? '左' : '右';
        setText(this.els.kneeName, side + '膝');
        setText(this.els.hipName, side + '髖');
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
