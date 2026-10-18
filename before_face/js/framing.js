// 入鏡提示：根據拍到哪些關節，告訴使用者該怎麼站，才能讓全身入鏡
// 深蹲、伏地挺身、棒式、弓箭步都需要看到全身（特別是髖、膝、踝），角度計算才會準

import { P, isVisible } from './landmarks.js';

const HOLD_MS = 600;  // 同一個提示要持續這麼久才換上去，避免文字在兩種提示之間一直跳

// 依照這一格的關鍵點，判斷入鏡狀況；回傳 { text, kind }，kind：'ok' 綠色、'warn' 橘色
export function framingAdvice(landmarks) {
    const seen = keys => keys.every(k => isVisible(landmarks[P[k]]));
    const shoulders = seen(['LEFT_SHOULDER', 'RIGHT_SHOULDER']);
    const hips = seen(['LEFT_HIP', 'RIGHT_HIP']);
    const legs = seen(['LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE']);

    if (!hips) return { text: '太近了，請往後退，讓全身入鏡', kind: 'warn' };
    if (!legs) return { text: '看不到腳，請再往後退一點', kind: 'warn' };
    if (!shoulders) return { text: '看不到肩膀，請調整鏡頭角度', kind: 'warn' };

    // 全身都看得到：再看人在畫面裡的大小與位置
    const main = ['NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_HIP', 'RIGHT_HIP',
        'LEFT_ANKLE', 'RIGHT_ANKLE'].map(k => landmarks[P[k]]);
    const xs = main.map(p => p.x);
    const ys = main.map(p => p.y);
    // 取寬或高較大的一邊：站著時看高度，伏地挺身、棒式躺平時看寬度
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    if (size < 0.25) return { text: '離太遠了，可以往前一點', kind: 'warn' };
    if (centerX < 0.2 || centerX > 0.8) return { text: '請站到畫面中間一點', kind: 'warn' };
    return { text: '已偵測到全身', kind: 'ok' };
}

// 讓提示穩定：新的提示要連續出現 HOLD_MS 才會換上去
export class FramingHint {
    constructor() {
        this.reset();
    }
    reset() {
        this.shown = null;
        this.candidate = null;
        this.since = 0;
    }
    // 回傳目前要顯示的提示 { text, kind }
    update(advice, timeMs) {
        if (!this.shown) {
            this.shown = advice;
            return this.shown;
        }
        if (advice.text === this.shown.text) {
            this.candidate = null;
        } else if (!this.candidate || this.candidate.text !== advice.text) {
            this.candidate = advice;
            this.since = timeMs;
        } else if (timeMs - this.since >= HOLD_MS) {
            this.shown = advice;
            this.candidate = null;
        }
        return this.shown;
    }
}
