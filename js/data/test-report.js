// 實測報表（10/21）：一次讀很多個實測錄製檔（實測模式錄的，test_ 開頭），每一組比對「應該做的」和「網站算的」
// 正確答案來自檔案裡的實測資訊（meta.test，經過 test-mode.js 的 testInfo 比對清單）：這組做幾下（或撐幾秒）、做對還是故意做哪一種錯
// 網站算的用重播分析同一套算法（replay-core.js），和當時鏡頭畫面上的一樣；這裡只負責比對、加總，畫面在 js/pages/report.js
// 老師的四個指標（11/18：精確率、召回率、準確率、F1，js/data/metrics.js）：ruleTables 數規則的四格，MediaPipe、YOLO 錄的分開

import { WORKOUTS, isWorkout } from '../analysis/workouts.js';
import { errorShort, errorRule } from '../analysis/form.js';
import { isModelKey, familyOf, hasFeet, profileOf } from '../ai/models.js';
import { addCounts, scores } from './metrics.js';

// 一組的結果
// info：testInfo(meta)；items：analyzeRecording 的 reps（棒式是每一次撐的 { seconds, errors }）；kind：'reps' 或 'hold'
// startedAt：開始錄的時間（毫秒，同一組重錄時用最後一次）；name：檔名
// model：錄的時候用哪個 AI 模型（js/ai/models.js 的代號，例如 'lite'、'yolo-n'；檔案的 meta.model 經過 keyOfFile）；
//   不認得的（很舊的錄製檔沒寫、被改過）當作 MediaPipe（重播分析也這樣算，11/21 以前只有 MediaPipe）
export function setResult(info, items, kind, startedAt = 0, name = '', model = '') {
    const errorsOf = item => (Array.isArray(item.errors) ? item.errors : []);
    const counts = {};
    for (const item of items) for (const e of new Set(errorsOf(item))) counts[e] = (counts[e] || 0) + 1;
    const good = info.condition === 'good';
    const key = isModelKey(model) ? model : '';
    const rule = good ? null : errorRule(info.workout, info.condition);
    const row = {
        subject: info.subject, workout: info.workout, condition: info.condition, conditionName: info.name,
        kind, expected: info.amount, unit: info.unit, startedAt, name, errorCounts: counts, redo: false,
        model: key, family: familyOf(key) || 'mediapipe',
        // 這個模型判斷不了這組要做的錯誤（YOLO 沒有腳跟、腳尖：故意腳跟離地、前膝超過腳尖）：四個指標不算這組（沒有判斷，不是漏掉）
        blind: !!(rule && rule.feet) && !hasFeet(key)
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

// 報表的順序：受測者、動作（深蹲、弓箭步、伏地挺身、棒式）、這組（做對在前面）、開始錄的時間（實測報表、AI 模型的資料都照這個順序）
export const WORKOUT_ORDER = ['squat', 'lunge', 'pushup', 'plank'];
export function sortReport(rows) {
    const w = id => WORKOUT_ORDER.indexOf(id);
    return rows.sort((a, b) => a.subject.localeCompare(b.subject) || w(a.workout) - w(b.workout)
        || (a.condition === 'good' ? -1 : 0) - (b.condition === 'good' ? -1 : 0) || a.condition.localeCompare(b.condition) || a.startedAt - b.startedAt);
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

// 老師的四個指標（11/18）：規則判斷動作錯誤的四格，每一家模型（錄的時候用 MediaPipe 還是 YOLO）各一張表，不算重錄的
//   計次的動作一下一格：故意做錯的組算應該做的下數（抓到＋漏掉），做對的組算網站算到的下數（誤報＋沒事），和上面「抓到」「誤報」同一套
//   棒式一組一格（看一組有沒有抓到、有沒有誤報）；計次的動作有兩個以上時加一列合計（棒式的單位不同，不加進去）
//   這一家判斷不了的錯誤（setResult 的 blind）不算進來，另外列出幾組
// 回傳 [{ family, lines: [{ workout, label, counts, precision, recall, accuracy, f1 }], skipped: [{ workout, condition, name, sets }] }]
export function ruleTables(rows) {
    const families = new Map();
    for (const r of rows) {
        if (r.redo) continue;
        const family = r.family === 'yolo' ? 'yolo' : 'mediapipe';
        if (!families.has(family)) families.set(family, { byWorkout: new Map(), skipped: new Map() });
        const g = families.get(family);
        if (r.blind) {
            const key = r.workout + '|' + r.condition;
            const s = g.skipped.get(key) || { workout: r.workout, condition: r.condition, name: r.conditionName, sets: 0 };
            s.sets++;
            g.skipped.set(key, s);
            continue;
        }
        const c = g.byWorkout.get(r.workout) || { tp: 0, fn: 0, fp: 0, tn: 0 };
        const good = r.condition === 'good';
        if (r.kind === 'hold') {
            if (good) { c.fp += r.falseAlarms; c.tn += 1 - r.falseAlarms; }
            else { c.tp += r.caught; c.fn += 1 - r.caught; }
        } else if (good) {
            c.fp += r.falseAlarms; c.tn += r.counted - r.falseAlarms;
        } else {
            c.tp += r.caught; c.fn += r.expected - r.caught;
        }
        g.byWorkout.set(r.workout, c);
    }
    return ['mediapipe', 'yolo'].filter(f => families.has(f)).map(family => {
        const g = families.get(family);
        const line = (workout, label, counts) => ({ workout, label, counts, ...scores(counts) });
        const reps = WORKOUT_ORDER.filter(w => w !== 'plank' && g.byWorkout.has(w));
        const lines = reps.map(w => line(w, WORKOUTS[w].name, g.byWorkout.get(w)));
        // 名字短一點：320 寬的手機上這一欄會換行（「合計」是上面幾個計次的動作加起來，說明在報表的「這四個指標怎麼算」）
        if (reps.length > 1) lines.push(line('total', '合計', reps.reduce((sum, w) => addCounts(sum, g.byWorkout.get(w)), {})));
        if (g.byWorkout.has('plank')) lines.push(line('plank', '棒式（以組計）', g.byWorkout.get('plank')));
        return { family, lines, skipped: [...g.skipped.values()] };
    });
}

// AI 模型、規則猜每一下（實測報表「AI 模型的資料」）：猜的標記和這組要做的比，數四格
// pairs：[{ truth：這組要做的（'good' 或錯誤代號）, guess：猜的 }]；故意做錯的那一下猜對那一種錯才算抓到（和規則的「抓到」一樣）
export function labelCounts(pairs) {
    const c = { tp: 0, fn: 0, fp: 0, tn: 0 };
    for (const { truth, guess } of pairs) {
        if (truth === 'good') {
            if (guess === 'good') c.tn++;
            else c.fp++;
        } else if (guess === truth) {
            c.tp++;
        } else {
            c.fn++;
        }
    }
    return c;
}

// 錄的時候用的 AI 模型（報表的小字、CSV）：「MediaPipe lite」「YOLO26n」；檔案沒寫的是空字串
export const modelText = key => (isModelKey(key) ? profileOf(key).label : '');
export const FAMILY_NAME = { mediapipe: 'MediaPipe', yolo: 'YOLO' };

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
    const head = ['受測者', '動作', '這組', '應做', '單位', '網站算', '次數對', '抓到', '誤報', '另外的錯誤', '錯誤明細', '重錄（不算）', '模型', '檔名', '開始錄'];
    const body = rows.map(r => [
        r.subject, isWorkout(r.workout) ? WORKOUTS[r.workout].name : r.workout, r.conditionName, r.expected, r.unit,
        r.kind === 'hold' ? Math.floor(r.seconds) : r.counted, r.kind === 'hold' ? '' : (r.countOk ? '對' : '不對'),
        r.caught, r.falseAlarms, r.otherErrors ?? '', errorText(r.errorCounts), r.redo ? '是' : '', modelText(r.model), r.name,
        r.startedAt ? new Date(r.startedAt).toLocaleString('zh-TW', { hour12: false }) : ''
    ].map(cell).join(','));
    return '﻿' + [head.join(','), ...body].join('\r\n') + '\r\n';
}
