// 動作穩定度（10/30，計畫書研究目標 2 的「穩定度」、目標 4 的「自動判別穩定度下降」）：
//   深蹲、弓箭步：每一下做的時候，重心前後晃動多少（重心比腳踝往前多少的標準差，小腿長 100%，和 balance.js 的「站著時前後晃動」同一個單位）
//   棒式：撐著的時候，髖部上下晃動多少（身體彎幾度的標準差，往下彎是正、往上翹是負，和塌腰、屁股太高的「腰往下彎幾度」同一個量法）
//     每 2 秒算一次再平均：慢慢塌下去（越撐越塌）不算晃動，另外寫「髖部的位置」前段 → 後段
//   做 6 下以上（棒式撐 12 秒以上）時，前三分之一和後三分之一比（和疲勞分析一樣），看越做越晃
//
// 只顯示數字，不判斷穩不穩（和 10/24 的平衡與重心一樣）：門檻要用真人的資料訂。10/20 的實測檔跟著舊的開發環境不見了，要重新拿到才能訂
// 參考的數字（示範動畫走一遍 WorkoutTracker 試算，見開發日誌 10/30；640×480 的畫面）：
//   深蹲、弓箭步：示範動畫（標準動作、完全不晃）每一下 2.3%、2.7%（蹲下去時屁股往後、膝蓋往前，重心本來就會前後移一點），
//     做得快、做得慢都一樣，底部停一下會小一點（標準差照時間算，停在同一個位置越久越小：停 0.5 秒 2.1%、1 秒 1.9%、2 秒 1.6%）；
//     每個點加 ±1 像素的雜訊差不到 0.1%、±3 像素多 0.2～0.4%；
//     整個人（腳不動）每秒前後晃一次 ±6 像素變成 3.4～4.8%、±13 像素 6.3～8.5%
//   棒式：示範動畫 ±0°；加 ±1 像素的雜訊 ±0.2°、±3 像素 ±0.8°；髖部上下晃 ±2.4 像素 ±1.3°、±4.8 像素 ±2.6°
//   10/20 實測站著不動時（balance.js 的「前後晃動」，研究成果頁）：受測者 B 0.5～1.9%、A 2.8～7.2%（A 站得比較遠，小腿在畫面上比較短）
//     真人站著就比示範動畫蹲一下還多，所以不能拿示範動畫的數字當門檻
import { balanceOf } from './balance.js';
import { hipSag, bendDegrees } from './form.js';
import { clearerSide } from '../skeleton/landmarks.js';
import { FATIGUE } from './fatigue.js';

export const STABILITY = {
    REP_WORKOUTS: ['squat', 'lunge'],   // 站著、兩腳踩著做的；伏地挺身這次沒排（工作表 10/30 只有棒式、深蹲、弓箭步）
    MIN_FRAMES: 10,      // 一下至少 10 格算得出重心才算（慢的手機每秒約 5 格，一下約 2 秒）
    WINDOW_MS: 2000,     // 棒式每 2 秒算一次晃動
    WINDOW_FRAMES: 5,    // 每 2 秒至少 5 格
    MIN_WINDOWS: 6,      // 棒式撐 12 秒以上（6 段）才比前段、後段（前後各至少 2 段）
    REFERENCE: { squat: 2.3, lunge: 2.7 }   // 示範動畫算出來的（tests/stability.test.mjs 檢查）
};

const round1 = v => Math.round(v * 10) / 10;
const mean = list => list.reduce((s, v) => s + v, 0) / list.length;
const std = list => {
    const m = mean(list);
    return Math.sqrt(list.reduce((s, v) => s + (v - m) ** 2, 0) / list.length);
};

// 這一格要記的數字：深蹲、弓箭步是重心比腳踝往前多少（%），棒式是身體彎幾度；算不出來回傳 null
export function stabilityValue(workoutId, pose) {
    if (!pose) return null;
    if (STABILITY.REP_WORKOUTS.includes(workoutId)) {
        const b = balanceOf(pose);
        return b ? b.offset : null;
    }
    if (workoutId === 'plank') {
        const sag = hipSag(pose, clearerSide(pose.landmarks));
        return sag === null ? null : bendDegrees(sag);
    }
    return null;
}

// 一下的重心前後晃動（%，小數第 1 位）；格數不夠回傳 null
export function repSway(values) {
    if (!Array.isArray(values) || values.length < STABILITY.MIN_FRAMES) return null;
    return round1(std(values));
}

// 棒式：每 2 秒一段，一段結束就算好（標準差、平均）、不留每一格（10/29 保養看過記憶體：撐 10 分鐘也只留 300 段）
class HoldWindows {
    constructor() {
        this.windows = [];   // 每一段 { sd, level }
        this.cur = [];       // 這一段的數字
        this.start = null;
    }

    add(t, v) {
        if (this.start === null) this.start = t;
        if (t - this.start >= STABILITY.WINDOW_MS) {
            this.close();
            this.start = t;
        }
        this.cur.push(v);
    }

    // 這一段結束：格數夠才算（手機很慢、中途看不到人的那段不算）
    close() {
        if (this.cur.length >= STABILITY.WINDOW_FRAMES) this.windows.push({ sd: std(this.cur), level: mean(this.cur) });
        this.cur = [];
    }

    // 回傳 null（一段都沒有）或 { sway（每 2 秒的標準差平均，度）,
    //   front、back（前三分之一、後三分之一的晃動；不到 12 秒是 null）, levelFront、levelBack（前段、後段身體平均彎幾度，往下是正）}
    result() {
        this.close();
        const windows = this.windows;
        if (!windows.length) return null;
        const out = { sway: round1(mean(windows.map(w => w.sd))), front: null, back: null, levelFront: null, levelBack: null };
        if (windows.length >= STABILITY.MIN_WINDOWS) {
            const k = Math.floor(windows.length / 3);
            const head = windows.slice(0, k), tail = windows.slice(-k);
            out.front = round1(mean(head.map(w => w.sd)));
            out.back = round1(mean(tail.map(w => w.sd)));
            out.levelFront = round1(mean(head.map(w => w.level)));
            out.levelBack = round1(mean(tail.map(w => w.level)));
        }
        return out;
    }
}

// 棒式一次：samples 是撐著（計時中）的格子 [{ t（毫秒）, v（身體彎幾度）}]；結果見 HoldWindows 的 result()
export function holdSway(samples) {
    if (!Array.isArray(samples)) return null;
    const w = new HoldWindows();
    for (const s of samples) w.add(s.t, s.v);
    return w.result();
}

// 記每一下（棒式每一次）的數字，做完時算好、清掉（WorkoutTracker 用，鏡頭畫面和重播分析一樣）
export class StabilityMeter {
    constructor(workoutId) {
        this.workoutId = workoutId;
        this.on = STABILITY.REP_WORKOUTS.includes(workoutId) || workoutId === 'plank';
        this.clear();
    }

    clear() {
        this.values = [];                  // 深蹲、弓箭步：這一下每一格的重心（一下只有幾秒）
        this.holdWindows = new HoldWindows();   // 棒式：每 2 秒一段
    }

    // 做這一下的期間（棒式：撐著、正在計時）每一格
    add(pose, timeMs) {
        if (!this.on) return;
        const v = stabilityValue(this.workoutId, pose);
        if (v === null || !Number.isFinite(v)) return;
        if (this.workoutId === 'plank') this.holdWindows.add(timeMs, v);
        else this.values.push(v);
    }

    // 做完的這一下：回傳要記到這一下的欄位（不看的動作回傳 {}）
    take() {
        const values = this.values, windows = this.holdWindows;
        this.clear();
        if (!this.on) return {};
        if (this.workoutId === 'plank') {
            const h = windows.result();
            return h ? { sway: h.sway, swayFront: h.front, swayBack: h.back, levelFront: h.levelFront, levelBack: h.levelBack } : { sway: null };
        }
        return { sway: repSway(values) };
    }
}

// series：repSeries() 的結果。回傳 null（這個動作不看、一下都沒算到）或
//   計次：{ kind: 'reps', average, reference, most: { n, sway }, judged, front/back: { from, to, sway } 或 null（不到 6 下） }
//   棒式：{ kind: 'hold', n（看最久、有算到的那一次）, seconds, sway, front, back, levelFront, levelBack }
export function stabilityOf(series, workoutId) {
    if (!series) return null;
    if (series.kind === 'hold') {
        const judged = series.holds.filter(h => h.sway !== null && h.sway !== undefined);
        if (!judged.length) return null;
        const h = judged.reduce((a, b) => (b.seconds > a.seconds ? b : a));
        return { kind: 'hold', n: h.n, seconds: h.seconds, sway: h.sway, front: h.swayFront, back: h.swayBack, levelFront: h.levelFront, levelBack: h.levelBack };
    }
    if (series.kind !== 'reps') return null;
    const judged = series.reps.filter(r => r.sway !== null && r.sway !== undefined);
    if (!judged.length) return null;
    const most = judged.reduce((a, b) => (b.sway > a.sway ? b : a));
    const out = {
        kind: 'reps',
        average: round1(mean(judged.map(r => r.sway))),
        reference: Object.prototype.hasOwnProperty.call(STABILITY.REFERENCE, workoutId) ? STABILITY.REFERENCE[workoutId] : null,
        most: { n: most.n, sway: most.sway },
        judged: judged.length,
        front: null, back: null
    };
    if (judged.length >= FATIGUE.MIN_REPS) {
        const k = Math.floor(judged.length / 3);
        const part = list => ({ from: list[0].n, to: list[list.length - 1].n, sway: round1(mean(list.map(r => r.sway))) });
        out.front = part(judged.slice(0, k));
        out.back = part(judged.slice(-k));
    }
    return out;
}

const range = p => (p.from === p.to ? '第 ' + p.from + ' 下' : '第 ' + p.from + '～' + p.to + ' 下');
const level = v => (v > 0 ? '往下彎 ' + v + '°' : v < 0 ? '往上翹 ' + round1(-v) + '°' : '一直線');

// 總結的那一句
export function stabilityLine(s) {
    if (!s) return '';
    if (s.kind === 'hold') {
        const parts = ['髖部上下晃動 ±' + s.sway + '°（第 ' + s.n + ' 次，撐 ' + s.seconds + ' 秒）'];
        if (s.front !== null && s.back !== null) {
            parts.push('前段 ±' + s.front + '° → 後段 ±' + s.back + '°');
            parts.push('髖部的位置 前段' + level(s.levelFront) + ' → 後段' + level(s.levelBack));
        } else {
            parts.push('撐 12 秒以上才比前段、後段');
        }
        return '動作穩定度：' + parts.join('；');
    }
    const parts = ['重心前後晃動平均 ' + s.average + '%（小腿長 100%' + (s.reference !== null ? '；示範動畫 ' + s.reference + '%' : '') + '）'
        + (s.judged > 1 ? '，最多的是第 ' + s.most.n + ' 下（' + s.most.sway + '%）' : '')];
    if (s.front && s.back) parts.push('前段（' + range(s.front) + '）' + s.front.sway + '% → 後段（' + range(s.back) + '）' + s.back.sway + '%');
    else parts.push('做 ' + FATIGUE.MIN_REPS + ' 下以上才比前段、後段');
    return '動作穩定度：' + parts.join('；');
}
