// 運動總結：一次運動（開鏡頭到關鏡頭，或換動作之前）做了幾下、品質怎麼樣，並和上一次同一個動作比較
// 紀錄存在這台裝置上（最多 50 次），不會上傳；首頁顯示「這次運動」和「運動紀錄」

import { WORKOUTS, formatSeconds } from './workouts.js';
import { errorShort } from './form.js';

const KEY = 'workoutHistory';
const MAX = 50;

export const errorName = errorShort;

// workoutId：哪個動作；items：counter.reps（計次）或 counter.holds（棒式）；startMs、endMs：開始、結束的時間（Date.now()）
// 沒有做任何一下（或撐不到一次）回傳 null
export function summarize(workoutId, items, startMs, endMs) {
    const w = WORKOUTS[workoutId];
    if (!w || !w.kind || !items || !items.length) return null;
    const errors = {};
    let clean = 0;
    for (const it of items) {
        const list = it.errors || [];
        if (!list.length) clean++;
        for (const id of list) errors[id] = (errors[id] || 0) + 1;
    }
    const s = { workout: workoutId, date: startMs, minutes: Math.max(0, (endMs - startMs) / 60000), count: items.length, clean, errors };
    if (w.kind === 'hold') {
        s.seconds = items.map(h => Math.round(h.seconds));
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
        lines.push('最低 ' + s.best + '°、平均 ' + s.average + '°，每下約 ' + s.tempo + ' 秒'
            + (s.similarity !== null && s.similarity !== undefined ? '；和示範動作相似 ' + s.similarity + '%' : ''));
    }
    const errs = Object.entries(s.errors).sort((a, b) => b[1] - a[1]);
    lines.push(errs.length
        ? '要注意：' + errs.map(([id, n]) => errorName(id) + ' ' + n + ' ' + (w.kind === 'hold' ? '次' : '下')).join('、')
        : '每一' + (w.kind === 'hold' ? '次' : '下') + '都沒有偵測到錯誤');
    return lines;
}

// ---------- 紀錄（這台裝置的 localStorage） ----------
export function loadHistory() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list.filter(s => s && WORKOUTS[s.workout]) : [];
    } catch (err) {
        return [];
    }
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
