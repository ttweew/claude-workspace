// 入鏡提示：根據拍到哪些關節，告訴使用者該怎麼站，才能讓全身入鏡
// 深蹲、伏地挺身、棒式、弓箭步都需要看到全身（特別是髖、膝、踝），角度計算才會準

import { P, isVisible } from '../skeleton/landmarks.js';

const HOLD_MS = 600;  // 同一個提示要持續這麼久才換上去，避免文字在兩種提示之間一直跳

// 剛偵測到人時：點要穩定一下才會畫出來（ghost.js），這段時間還看不出站位，先顯示這個
const CHECKING = { text: '偵測中…', kind: '' };
// 沒有偵測到人（main.js 也用這個，提示文字只寫在這裡）
export const NO_PERSON = { text: '未偵測到人體，請站進畫面', kind: 'warn' };

// 髖看得到、腳看不到，但 AI 估計的膝蓋、腳踝都在畫面裡：腳是被擋住（蹲低、坐下、側面被另一隻腳擋住），不是出了畫面
// 這時候叫人往後退會誤導（真實錄影：蹲低時跳出「請再往後退」，最長 10 秒）
const LEGS_BLOCKED = { text: '看不到腳，可能被擋住了', kind: 'warn' };
// 估計位置離畫面下緣至少這麼多才算在畫面裡：腳真的出了畫面時，AI 估計的腳踝通常在 1.0 以下（真實錄影 1.02）
const IN_FRAME = 0.95;

function legsInFrame(landmarks) {
    const inside = p => p && Number.isFinite(p.x) && Number.isFinite(p.y)
        && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= IN_FRAME;
    // 兩側的膝蓋、腳踝都要在畫面裡：只要有一個估計在畫面外，就當成出了畫面，照舊提示往後退
    return ['LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE'].every(k => inside(landmarks[P[k]]));
}

// 看得到的那一側「肩→髖→膝→踝」三段長度加起來（兩側都看得到取長的）；看不全就是 0
function legChain(landmarks) {
    let best = 0;
    for (const side of ['LEFT_', 'RIGHT_']) {
        const pts = ['SHOULDER', 'HIP', 'KNEE', 'ANKLE'].map(k => landmarks[P[side + k]]);
        if (!pts.every(isVisible)) continue;
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        best = Math.max(best, len);
    }
    return best;
}

// 依照這一格的關鍵點，判斷入鏡狀況；回傳 { text, kind }，kind：'ok' 綠色、'warn' 橘色
export function framingAdvice(landmarks) {
    // 一個點都還沒畫出來（剛偵測到人，點還在確認中）：還不能判斷，不要誤報「太近了」
    if (!landmarks.some(isVisible)) return CHECKING;
    // 左右任一邊看得到就算：從側面拍時，遠離鏡頭的那一側會被身體擋住，這是正常的
    const seen = keys => keys.every(k => isVisible(landmarks[P[k]]));
    const either = keys => seen(keys.map(k => 'LEFT_' + k)) || seen(keys.map(k => 'RIGHT_' + k));
    const shoulders = either(['SHOULDER']);
    const hips = either(['HIP']);
    const legs = either(['KNEE', 'ANKLE']);

    if (!hips) return { text: '太近了，請往後退，讓全身入鏡', kind: 'warn' };
    if (!legs) return legsInFrame(landmarks) ? LEGS_BLOCKED : { text: '看不到腳，請再往後退一點', kind: 'warn' };
    if (!shoulders) return { text: '看不到肩膀，請調整鏡頭角度', kind: 'warn' };

    // 全身都看得到：再看人在畫面裡的大小與位置（只用看得到的點）
    const main = ['NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_HIP', 'RIGHT_HIP',
        'LEFT_ANKLE', 'RIGHT_ANKLE'].map(k => landmarks[P[k]]).filter(isVisible);
    const xs = main.map(p => p.x);
    const ys = main.map(p => p.y);
    // 取寬或高較大的一邊：站著時看高度，伏地挺身、棒式躺平時看寬度
    // 蹲低時頭到腳的高度會少將近一半，但身體本身沒有變小：也量「肩→髖→膝→踝」沿著身體的長度，取大的
    // 站直時這段長度比頭到腳短，不影響原本的判斷（真實錄影：蹲到底時誤跳「離太遠了」約 2 秒）
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), legChain(landmarks));
    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    if (size < 0.25) return { text: '離太遠了，可以往前一點', kind: 'warn' };
    if (centerX < 0.2 || centerX > 0.8) return { text: '請站到畫面中間一點', kind: 'warn' };
    return { text: '已偵測到全身', kind: 'ok' };
}

// 讓提示穩定：新的提示要連續出現 HOLD_MS 才會換上去
// 剛開始（還沒顯示過任何提示）時：一切正常就馬上顯示「已偵測到全身」；要使用者調整的提示一樣要持續 HOLD_MS，
// 期間先顯示「偵測中…」。以前第一個提示會馬上顯示，剛偵測到人的那一兩格點還沒畫出來，
// 會先閃出約 0.7 秒的「太近了，請往後退」
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
        // 還沒顯示過提示，或一直在「偵測中…」（例如光線太暗，點遲遲畫不出來）：一切正常就馬上換上
        // 原本沒有人、人走進來站好時也一樣，不用等
        if ((!this.shown || this.shown.text === CHECKING.text || this.shown.text === NO_PERSON.text) && advice.kind === 'ok') {
            this.shown = advice;
            this.candidate = null;
            return this.shown;
        }
        if (this.shown && advice.text === this.shown.text) {
            this.candidate = null;
        } else if (!this.candidate || this.candidate.text !== advice.text) {
            this.candidate = advice;
            this.since = timeMs;
        } else if (timeMs - this.since >= HOLD_MS) {
            this.shown = advice;
            this.candidate = null;
        }
        return this.shown || CHECKING;
    }
}
