// 運動總結：一次運動（開鏡頭到關鏡頭，或換動作之前）做了幾下、品質怎麼樣，並和上一次同一個動作比較
// 紀錄存在這台裝置上（最多 50 次）；打開「雲端同步」才會存一份到雲端（js/cloud/）；首頁顯示「這次運動」和「運動紀錄」

import { WORKOUTS, isWorkout, formatSeconds } from './workouts.js';
import { errorShort, errorRule, whyText } from './form.js';
import { goalLine } from './goal.js';

const KEY = 'workoutHistory';
const MAX = 50;

export const errorName = errorShort;
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// workoutId：哪個動作；items：counter.reps（計次）或 counter.holds（棒式）；startMs、endMs：開始、結束的時間（Date.now()）
// 沒有做任何一下（或撐不到一次）回傳 null
export function summarize(workoutId, items, startMs, endMs) {
    const w = isWorkout(workoutId) ? WORKOUTS[workoutId] : null;
    if (!w || !w.kind || !items || !items.length) return null;
    const errors = {};
    const peaks = {};   // 每種錯誤最嚴重的數字（度或 %，說出原因用；只存在這台裝置，不上傳雲端）
    let clean = 0;
    for (const it of items) {
        const list = it.errors || [];
        if (!list.length) clean++;
        for (const id of list) {
            errors[id] = (errors[id] || 0) + 1;
            const v = it.peaks ? it.peaks[id] : undefined;
            if (isNum(v) && !(peaks[id] >= v)) peaks[id] = v;
        }
    }
    const s = { workout: workoutId, date: startMs, minutes: Math.max(0, (endMs - startMs) / 60000), count: items.length, clean, errors };
    if (Object.keys(peaks).length) s.peaks = peaks;
    if (w.kind === 'hold') {
        // 無條件捨去：和鏡頭畫面上的秒數、每一次的提示（「撐了 0:12」）一樣，12.6 秒不會在總結變成 13 秒
        s.seconds = items.map(h => Math.floor(h.seconds));
        s.best = Math.max(...s.seconds);
        s.total = s.seconds.reduce((a, b) => a + b, 0);
    } else {
        s.good = items.filter(r => r.depth === 'good').length;
        s.close = items.filter(r => r.depth === 'close').length;
        s.shallow = items.filter(r => r.depth === 'shallow').length;
        const mins = items.map(r => r.min);
        s.best = Math.round(Math.min(...mins));
        s.average = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
        // 每一下花幾秒（從彎下去到站起來）
        s.tempo = Math.round(items.reduce((a, r) => a + (r.end - r.start), 0) / items.length * 10) / 10;
        // 和示範動作的相似度（similarity.js）平均幾分
        const sims = items.map(r => r.similarity).filter(v => v !== null && v !== undefined);
        s.similarity = sims.length ? Math.round(sims.reduce((a, b) => a + b, 0) / sims.length) : null;
    }
    return s;
}

// 和上一次同一個動作比較：回傳幾句話（例如「比上次多 2 下」），第一次做回傳空陣列
export function compare(s, previous) {
    if (!s || !previous) return [];
    const out = [];
    const unit = WORKOUTS[s.workout].kind === 'hold' ? '次' : '下';
    if (WORKOUTS[s.workout].kind === 'hold') {
        const d = s.best - previous.best;
        out.push(d > 0 ? '最久撐了 ' + formatSeconds(s.best) + '，比上次多 ' + d + ' 秒' : d < 0 ? '最久撐了 ' + formatSeconds(s.best) + '，比上次少 ' + -d + ' 秒' : '最久撐的秒數和上次一樣');
    } else {
        const d = s.count - previous.count;
        out.push(d > 0 ? '比上次多 ' + d + ' ' + unit : d < 0 ? '比上次少 ' + -d + ' ' + unit : '次數和上次一樣');
        const rate = x => Math.round(x.good / x.count * 100);
        const r = rate(s), p = rate(previous);
        out.push('到位比例 ' + r + '%' + (r > p ? '，比上次進步 ' + (r - p) + '%' : r < p ? '，比上次少 ' + (p - r) + '%' : '，和上次一樣'));
    }
    const cleanRate = x => Math.round(x.clean / x.count * 100);
    const c = cleanRate(s), pc = cleanRate(previous);
    if (c !== pc) out.push('沒有錯誤的比例 ' + c + '%（上次 ' + pc + '%）');
    return out;
}

// 總結寫成幾行字（首頁「這次運動」用）
export function describe(s) {
    const w = WORKOUTS[s.workout];
    const lines = [];
    if (w.kind === 'hold') {
        lines.push(w.name + ' ' + s.count + ' 次，最久 ' + formatSeconds(s.best) + '，總共 ' + formatSeconds(s.total));
    } else {
        lines.push(w.name + ' ' + s.count + ' 下：到位 ' + s.good + '、再低一點 ' + s.close + '、太淺 ' + s.shallow);
        // 相似度是 0～100 的數字才寫（10/24 安全複查：存的紀錄被改過時，以前會寫出「相似 [object Object]%」）
        const sim = s.similarity;
        lines.push('最低 ' + s.best + '°、平均 ' + s.average + '°，每下約 ' + s.tempo + ' 秒'
            + (isNum(sim) && sim >= 0 && sim <= 100 ? '；和示範動作相似 ' + Math.round(sim) + '%' : ''));
    }
    // 計次準確率（10/20）：填了實際做幾下才有這一行
    if (countsReps(s) && isCount(s.actual) && s.actual <= ACTUAL_MAX) {
        lines.push('你數的 ' + s.actual + ' 下，網站算 ' + s.count + ' 下：計次準確率 ' + countAccuracy(s.count, s.actual) + '%');
    }
    // 自訂目標（10/25，js/analysis/goal.js）：設了目標才有這一行；存的值不對（被改過）就不寫
    const goal = goalLine(s);
    if (goal) lines.push(goal);
    // 只寫認得的錯誤（舊版的代號、被改過的名字不寫；雲端上傳也一樣不收，見 js/cloud/sync.js）
    const errs = Object.entries(s.errors).filter(([id]) => errorRule(s.workout, id)).sort((a, b) => b[1] - a[1]);
    lines.push(errs.length
        ? '要注意：' + errs.map(([id, n]) => errorName(id) + ' ' + n + ' ' + (w.kind === 'hold' ? '次' : '下')).join('、')
        : '每一' + (w.kind === 'hold' ? '次' : '下') + '都沒有偵測到錯誤');
    // 說出原因（10/19）：每種錯誤最嚴重的時候量到多少、門檻多少，實測時看得出是門檻太嚴還是真的做錯
    // 舊的紀錄沒有 peaks、被改過的不是數字：那一種就不寫
    const peaks = s.peaks && typeof s.peaks === 'object' ? s.peaks : {};
    for (const [id] of errs) {
        const rule = errorRule(s.workout, id);
        const text = rule && Object.prototype.hasOwnProperty.call(peaks, id) ? whyText(rule, peaks[id]) : '';
        if (text) lines.push('最嚴重的一下：' + text);
    }
    return lines;
}

// ---------- 計次準確率（10/20）：關鏡頭後填「實際做了幾下」，和網站算的比 ----------
// 實測時用：網站算 9 下、自己數 10 下 → 準確率 90%
// 只存在這台裝置的紀錄裡（actual 欄位），不上傳雲端：js/cloud/sync.js 的白名單沒有這一欄
export const ACTUAL_MAX = 999;

// 這一次是計次的動作（深蹲、伏地挺身、弓箭步）才填實際次數；棒式是計時
export const countsReps = s => !!s && isWorkout(s.workout) && WORKOUTS[s.workout].kind === 'reps';

// 使用者填的字 → 整數；不是 0～999 的整數（空白、9.5、-1、1e3、abc）回傳 null
// 中文輸入法打出來的全形數字（１０）也認得
export function parseActual(text) {
    const t = String(text ?? '').trim().replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10));
    return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

// 準確率（%）：1 − |網站算的 − 實際| ÷ 實際，最低 0%；實際 0 下時網站也算 0 下才是 100%
export function countAccuracy(counted, actual) {
    if (actual === 0) return counted === 0 ? 100 : 0;
    return Math.max(0, Math.round((1 - Math.abs(counted - actual) / actual) * 100));
}

// 把實際次數記到這一次的紀錄（用動作和開始時間找）；s 也一起改，總結重新寫的時候就有這一行
export function setActual(s, actual) {
    s.actual = actual;
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        if (!Array.isArray(list)) return;
        // 從最新的往回找（不用 findLast：iPhone iOS 15.0～15.3 沒有）
        const hit = [...list].reverse().find(x => x && x.workout === s.workout && x.date === s.date);
        if (!hit) return;
        hit.actual = actual;
        localStorage.setItem(KEY, JSON.stringify(list));
    } catch (err) { /* 存不了就只在畫面上顯示 */ }
}

// ---------- 紀錄（這台裝置的 localStorage） ----------
export function loadHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list.filter(validSession) : [];
    } catch (err) {
        return [];
    }
}
// 紀錄可能是舊版存的、被改過或損壞的：欄位不對的那一筆不用（不然總結、比較會出現 NaN 或讓首頁出錯）
const isCount = v => Number.isInteger(v) && v >= 0;
export function validSession(s) {
    if (!s || typeof s !== 'object' || !isWorkout(s.workout) || !WORKOUTS[s.workout].kind) return false;
    if (!isCount(s.count) || !s.count || !isCount(s.clean) || s.clean > s.count || !isNum(s.date)) return false;
    if (!s.errors || typeof s.errors !== 'object' || Array.isArray(s.errors) || !Object.values(s.errors).every(isCount)) return false;
    if (WORKOUTS[s.workout].kind === 'hold') return isNum(s.best) && isNum(s.total);
    return [s.good, s.close, s.shallow].every(isCount) && s.good + s.close + s.shallow === s.count && [s.best, s.average, s.tempo].every(isNum);
}
// 存一次，回傳上一次同一個動作的總結（沒有的話 null）
export function saveSession(s) {
    const list = loadHistory();
    const previous = [...list].reverse().find(x => x.workout === s.workout) || null;
    list.push(s);
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (err) { /* 存不了就算了 */ }
    return previous;
}
export function clearHistory() {
    try { localStorage.removeItem(KEY); } catch (err) { /* 沒關係 */ }
}
