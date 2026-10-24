// 實測報表（10/21）：一次讀很多個實測錄製檔（實測模式錄的，test_ 開頭），每一組比對「應該做的」和「網站算的」
// 正確答案來自檔案裡的實測資訊（meta.test，經過 test-mode.js 的 testInfo 比對清單）：這組做幾下（或撐幾秒）、做對還是故意做哪一種錯
// 網站算的用重播分析同一套算法（replay-core.js），和當時鏡頭畫面上的一樣；這裡只負責比對、加總，畫面在 js/pages/report.js

import { WORKOUTS, isWorkout } from '../analysis/workouts.js';
import { errorShort } from '../analysis/form.js';

// 一組的結果
// info：testInfo(meta)；items：analyzeRecording 的 reps（棒式是每一次撐的 { seconds, errors }）；kind：'reps' 或 'hold'
// startedAt：開始錄的時間（毫秒，同一組重錄時用最後一次）；name：檔名
export function setResult(info, items, kind, startedAt = 0, name = '') {
    const errorsOf = item => (Array.isArray(item.errors) ? item.errors : []);
    const counts = {};
    for (const item of items) for (const e of new Set(errorsOf(item))) counts[e] = (counts[e] || 0) + 1;
    const good = info.condition === 'good';
    const row = {
        subject: info.subject, workout: info.workout, condition: info.condition, conditionName: info.name,
        kind, expected: info.amount, unit: info.unit, startedAt, name, errorCounts: counts, redo: false
    };
    if (kind === 'hold') {
        // 棒式：撐了幾秒（一組裡起身又趴下就是好幾次，加起來）；故意做錯的那種錯誤有沒有出現過；做對的有沒有出現任何錯誤
        row.counted = items.length;
        row.seconds = items.reduce((sum, h) => sum + (Number.isFinite(h.seconds) ? h.seconds : 0), 0);
        row.caught = good ? null : (counts[info.condition] ? 1 : 0);
        row.falseAlarms = good ? (items.some(h => errorsOf(h).length) ? 1 : 0) : null;
        return row;
    }
    // 計次：網站算了幾下、次數對不對；故意做錯的那幾下抓到幾下（最多算到應該做的下數）；做對的有幾下被報錯
    row.counted = items.length;
    row.countOk = items.length === info.amount;
    row.caught = good ? null : Math.min(info.amount, counts[info.condition] || 0);
    row.falseAlarms = good ? items.filter(i => errorsOf(i).length).length : null;
    // 故意做錯的組：除了這組要做的，還報了別的錯誤幾下（例如腳跟離地的組被報上身前傾）
    row.otherErrors = good ? null : items.filter(i => errorsOf(i).some(e => e !== info.condition)).length;
    return row;
}

// 同一個人、同一個動作、同一組錄了好幾次（次數做錯、中途停下來重錄）：以最後一次為準（主持人卡的規則），前面的標成重錄、不算進統計
export function markRedos(rows) {
    const latest = new Map();
    for (const r of rows) {
        const key = r.subject + '|' + r.workout + '|' + r.condition;
        const best = latest.get(key);
        if (!best || r.startedAt >= best.startedAt) latest.set(key, r);
    }
    for (const r of rows) r.redo = latest.get(r.subject + '|' + r.workout + '|' + r.condition) !== r;
    return rows;
}

// 整體統計（不算重錄的）
//   count：計次的組，次數完全正確幾組／幾組
//   errors：每一種錯誤（故意做錯的組）抓到幾下／應該幾下；棒式是抓到幾組／幾組
//   falseAlarms：做對的組，被報錯的下數／網站算到的下數；棒式是被報錯的組數／組數
//   people：受測者代號
export function summarizeReport(rows) {
    const used = rows.filter(r => !r.redo);
    const reps = used.filter(r => r.kind === 'reps');
    const holds = used.filter(r => r.kind === 'hold');
    const errors = {};
    for (const r of used) {
        if (r.caught === null) continue;
        const key = r.workout + '|' + r.condition;
        const e = errors[key] || (errors[key] = { workout: r.workout, condition: r.condition, name: r.conditionName, kind: r.kind, caught: 0, total: 0 });
        e.caught += r.caught;
        e.total += r.kind === 'hold' ? 1 : r.expected;
    }
    const goodReps = reps.filter(r => r.condition === 'good');
    const goodHolds = holds.filter(r => r.condition === 'good');
    return {
        sets: used.length,
        redos: rows.length - used.length,
        people: [...new Set(used.map(r => r.subject))].sort(),
        count: { ok: reps.filter(r => r.countOk).length, total: reps.length },
        errors: Object.values(errors),
        falseAlarms: {
            reps: goodReps.reduce((s, r) => s + r.falseAlarms, 0), of: goodReps.reduce((s, r) => s + r.counted, 0),
            holds: goodHolds.reduce((s, r) => s + r.falseAlarms, 0), holdSets: goodHolds.length
        }
    };
}

// 比例的文字：「8／10（80%）」；分母是 0 時「—」
export function ratioText(a, b) {
    return b ? a + '／' + b + '（' + Math.round(a / b * 100) + '%）' : '—';
}

// 每一組的錯誤明細：「上身前傾 5、腳跟離地 1」（沒有就是空字串）
export function errorText(counts) {
    return Object.entries(counts).map(([id, n]) => errorShort(id) + ' ' + n).join('、');
}

// 網站算的：「9 下」或「撐了 30 秒」（秒數無條件捨去，和畫面、總結一樣）
export function countedText(r) {
    return r.kind === 'hold' ? (r.counted ? '撐了 ' + Math.floor(r.seconds) + ' 秒' : '沒有開始計時') : r.counted + ' 下';
}

// 這一組的結果（一句話）
export function verdictText(r) {
    const errs = errorText(r.errorCounts);
    if (r.condition === 'good') {
        if (r.kind === 'hold') return r.falseAlarms ? '誤報：' + errs : '沒有誤報';
        return r.falseAlarms ? '誤報 ' + r.falseAlarms + ' 下（' + errs + '）' : '沒有誤報';
    }
    if (r.kind === 'hold') return r.caught ? '抓到' : '沒抓到' + (errs ? '（報了：' + errs + '）' : '');
    const others = Object.entries(r.errorCounts).filter(([id]) => id !== r.condition).map(([id, n]) => errorShort(id) + ' ' + n).join('、');
    return '抓到 ' + r.caught + '／' + r.expected + ' 下' + (others ? '（另外報了 ' + others + '）' : '');
}

// 下載用的 CSV（Excel 打得開：開頭加 BOM）；文字開頭是 = + - @ 時前面加 '（Excel 不會當成公式執行）；有逗號、引號、換行的加引號
// 開頭是 Tab、換行也加 '（10/24 安全複查：檔名是使用者給的，zip 裡的檔名可以用這些字開頭，有些試算表會跳過再當成公式）
export function reportCsv(rows) {
    const cell = v => {
        if (v === null || v === undefined) return '';
        let s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v);
        if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    };
    const head = ['受測者', '動作', '這組', '應做', '單位', '網站算', '次數對', '抓到', '誤報', '另外的錯誤', '錯誤明細', '重錄（不算）', '檔名', '開始錄'];
    const body = rows.map(r => [
        r.subject, isWorkout(r.workout) ? WORKOUTS[r.workout].name : r.workout, r.conditionName, r.expected, r.unit,
        r.kind === 'hold' ? Math.floor(r.seconds) : r.counted, r.kind === 'hold' ? '' : (r.countOk ? '對' : '不對'),
        r.caught, r.falseAlarms, r.otherErrors ?? '', errorText(r.errorCounts), r.redo ? '是' : '', r.name,
        r.startedAt ? new Date(r.startedAt).toLocaleString('zh-TW', { hour12: false }) : ''
    ].map(cell).join(','));
    return '﻿' + [head.join(','), ...body].join('\r\n') + '\r\n';
}
