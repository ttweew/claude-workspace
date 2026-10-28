// 疲勞分析（10/28）：同一組的前段和後段比，看有沒有變慢、變淺、錯誤變多、和示範動作的相似度下降
// 計畫書研究目標 4（動作品質變化、疲勞預警）：做完的總結寫一句＋前後段的表格，運動中出現跡象時提醒一次
// 每一下的數字用 rep-series.js（和每一下的圖表、表格同一套：角度四捨五入、秒數到小數第 1 位），
// 前段＝前三分之一、後段＝後三分之一（中間的不算，差別比較清楚），兩段的平均也照畫面的位數四捨五入，
// 門檻用四捨五入後的數字比：畫面上寫「2.0 → 3.0 秒」就是剛好 1.5 倍，算變慢
//
// 門檻怎麼訂的（10/20 實測，正常做的 7 組，每組 10～13 下，一組一兩分鐘、還不會累）：
//   後段和前段自然的差別最多：每下秒數 1.30 倍（A 弓箭步）、最低角度大 9.6°（B 弓箭步）、相似度掉 8 分（A 弓箭步）
//   門檻取自然差別的 1.5 倍（留一半的餘裕，正常做的不會被說成累了）；人多了再調
import { repSeries } from './rep-series.js';

export const FATIGUE = {
    MIN_REPS: 6,       // 前段、後段各至少 2 下：10/20 只做 5 下的組前後各 1 下，秒數差 0.49～1.57 倍，太亂
    SLOWER: 1.5,       // 後段每下的秒數 ≥ 前段的 1.5 倍（自然最多慢 30%，× 1.5 ＝ 45%，取 50%）
    SHALLOWER: 15,     // 後段的最低角度 ≥ 前段 + 15°（自然最多 9.6°，× 1.5 ≈ 15°）
    SIMILARITY: 12,    // 相似度掉 ≥ 12 分（自然最多 8 分，× 1.5）
    // 錯誤本來就是偵測到做錯，後段明顯變多就寫出來：有錯誤的比例多 ≥ 50 個百分點，而且至少多 2 下（差一下不算）
    // 10/20 A 弓箭步做對的那組：前段 0 下、後段 3 下有 2 下被報膝超過腳尖，會寫「錯誤變多」（是不是真的做錯還要看影片）
    ERRORS: 0.5,
    ERRORS_MIN: 2
};

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// 一段（前段或後段）的平均
function part(reps) {
    const secs = reps.map(r => r.seconds).filter(v => v !== null);
    const sims = reps.map(r => r.similarity).filter(v => v !== null);
    // 這一段最常出現的錯誤（寫「錯誤變多（上身前傾）」用）；一樣多時取先出現的
    const counts = new Map();
    for (const r of reps) for (const e of r.errors) counts.set(e, (counts.get(e) || 0) + 1);
    let top = null;
    for (const [name, c] of counts) if (!top || c > counts.get(top)) top = name;
    return {
        from: reps[0].n,
        to: reps[reps.length - 1].n,
        count: reps.length,
        seconds: secs.length ? Math.round(mean(secs) * 10) / 10 : null,
        angle: Math.round(mean(reps.map(r => r.angle))),
        errorReps: reps.filter(r => r.errors.length).length,
        topError: top,
        similarity: sims.length ? Math.round(mean(sims)) : null
    };
}

// series：repSeries() 的結果。回傳 null（棒式、不是計次、沒有可以比的）或
//   { enough: false, count, need }：還不夠 6 下
//   { enough: true, front, back, signs: [{ key, text }] }：key 是 slower／shallower／errors／similarity
export function fatigueOf(series) {
    if (!series || series.kind !== 'reps' || !Array.isArray(series.reps) || !series.reps.length) return null;
    const reps = series.reps;
    if (reps.length < FATIGUE.MIN_REPS) return { enough: false, count: reps.length, need: FATIGUE.MIN_REPS };
    const k = Math.floor(reps.length / 3);
    const front = part(reps.slice(0, k)), back = part(reps.slice(-k));
    const signs = [];
    // 1e-9：1.4 × 1.5 在電腦裡是 2.0999…，後段 2.1 秒要算剛好 1.5 倍
    if (front.seconds > 0 && back.seconds !== null && back.seconds / front.seconds >= FATIGUE.SLOWER - 1e-9) {
        signs.push({ key: 'slower', text: '變慢 ' + Math.round((back.seconds / front.seconds - 1) * 100) + '%' });
    }
    if (back.angle - front.angle >= FATIGUE.SHALLOWER) signs.push({ key: 'shallower', text: '變淺 ' + (back.angle - front.angle) + '°' });
    if (back.errorReps / back.count - front.errorReps / front.count >= FATIGUE.ERRORS - 1e-9 && back.errorReps - front.errorReps >= FATIGUE.ERRORS_MIN) {
        signs.push({ key: 'errors', text: '錯誤變多' + (back.topError ? '（' + back.topError + '）' : '') });
    }
    if (front.similarity !== null && back.similarity !== null && front.similarity - back.similarity >= FATIGUE.SIMILARITY) {
        signs.push({ key: 'similarity', text: '和示範動作的相似度掉 ' + (front.similarity - back.similarity) + ' 分' });
    }
    return { enough: true, front, back, signs };
}

// 總結的那一句（首頁「這次運動」）
export function fatigueLine(f) {
    if (!f) return '';
    if (!f.enough) return '疲勞分析：做 ' + f.need + ' 下以上才比前段和後段（這次 ' + f.count + ' 下）';
    const range = p => '第 ' + p.from + '～' + p.to + ' 下';
    return f.signs.length
        ? '疲勞分析：後段（' + range(f.back) + '）比前段（' + range(f.front) + '）' + f.signs.map(s => s.text).join('、') + '，可能累了'
        : '疲勞分析：前段（' + range(f.front) + '）和後段（' + range(f.back) + '）差不多，沒有看到疲勞的跡象';
}

// 運動中的疲勞提醒：講的話要短（說話規則：運動中只講短句）
export const TIRED_WORDS = { shallower: '越來越淺了' };

// 運動中的疲勞提醒（每組最多一次）：做到第 6 下以後，每一下做完都用「如果現在結束」的前段、後段比一次，
// 和做完的總結同一套。只提醒變淺：
//   變慢不提醒：自己做的運動節奏本來就會忽快忽慢。10/20 A 正常做的弓箭步，第 6～8 下花 2.3～2.8 秒（前 3 下 1.4～1.6 秒），
//   之後又變快；做到第 7 下時前後段比是 1.7 倍，會被說「變慢了」，整組做完卻只慢 30%。變慢留給做完的總結
//   錯誤不提醒：每一下本來就會講；相似度：數字講出來聽不懂
export class FatigueWatch {
    constructor() {
        this.said = false;
    }

    reset() {
        this.said = false;
    }

    // workoutId：動作代號；items：到現在做完的每一下（tracker.items）
    // 回傳要提醒的那一種（'shallower'），沒有或這組提醒過了回傳 null
    check(workoutId, items) {
        if (this.said) return null;
        const f = fatigueOf(repSeries(workoutId, items));
        const sign = f && f.enough ? f.signs.find(s => s.key === 'shallower') : null;
        if (!sign) return null;
        this.said = true;
        return sign.key;
    }
}
