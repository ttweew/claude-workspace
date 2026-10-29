// 動作流暢度（10/29，計畫書研究目標 2 的「流暢度」）：
//   每一下順不順：下去、起來的途中有沒有「卡一下」（速度掉到快停住，再繼續）
//   整組的節奏穩不穩：每一下的秒數和這組的平均（總結的「每下約幾秒」，同一個數字）差多少
// 首頁「這次運動」寫一句；每一下卡住時畫面提示寫「卡了一下」
// 畫面上叫「動作流暢度」：首頁「進階設定」的「畫面流暢度」是每秒幾格，不一樣
//
// 門檻怎麼訂的（10/20 實測，見開發日誌 10/29）：
//   卡一下：速度掉到這一段（下去或起來）最快時的一成以下、超過 0.2 秒（30 格的鏡頭是 6 格）才算；
//     最高、最低各 15% 的角度範圍不看（本來就會慢下來轉向）。正常做的深蹲、伏地挺身 43 下只有 1 下被抓到
//     （B 深蹲第 9 下下去時在 98° 停了約 0.3 秒，看曲線確實停住）；條件放寬到兩成、0.15 秒時 43 下有 3 下
//   弓箭步不看卡一下：膝蓋角度在兩腳之間換來換去、跨步時角度本來就會停住，正常的 20 下有 9 下會被說卡住
//   節奏：每一下和平均差不到 2 成算跟得上節奏，8 成的下數跟得上算穩。正常做的深蹲、伏地挺身每組 8 成以上；
//     A 弓箭步做對那組 4 成（中間 3 下 2.3～2.8 秒，前面 1.4～1.6 秒），寫「忽快忽慢」
import { PAUSE_REP } from './session.js';

export const FLUENCY = {
    LOW: 0.1,          // 速度掉到這一段最快時的一成以下
    HOLD_MS: 200,      // 超過 0.2 秒才算卡住
    EDGE: 0.15,        // 最高、最低各 15% 的角度範圍不看
    MIN_RANGE: 20,     // 這一段的角度變化不到 20° 不看（太淺，速度本來就慢）
    STALL_WORKOUTS: ['squat', 'pushup'],
    BAND: 0.2,         // 和平均差不到 2 成算跟得上節奏
    STEADY: 0.8,       // 8 成的下數跟得上算穩
    MIN_REPS: 5        // 5 下以上才看節奏（下數太少，一下就差兩成）
};

// 一下中途卡住幾次。samples：這一下的角度曲線 [{ t（毫秒）, v（度）}]，從站直（伸直）→ 最低 → 站直
// 回傳次數；這個動作不看（弓箭步、棒式）或曲線太短、太淺回傳 null
export function repStalls(workoutId, samples) {
    if (!FLUENCY.STALL_WORKOUTS.includes(workoutId) || !Array.isArray(samples) || samples.length < 6) return null;
    let bottom = 0;
    samples.forEach((p, i) => { if (p.v < samples[bottom].v) bottom = i; });
    // 速度：前後各一格的角度差 ÷ 時間（度／秒）
    const speed = samples.map((p, i) => {
        const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
        return b.t > a.t ? Math.abs(b.v - a.v) / (b.t - a.t) * 1000 : 0;
    });
    let stalls = 0, judged = false;
    for (const [from, to] of [[0, bottom], [bottom, samples.length - 1]]) {
        const low = samples[bottom].v, range = Math.max(samples[from].v, samples[to].v) - low;
        if (range < FLUENCY.MIN_RANGE || to - from < 4) continue;
        judged = true;
        const peak = Math.max(...speed.slice(from, to + 1));
        let since = null;
        for (let i = from; i <= to; i++) {
            const frac = (samples[i].v - low) / range;
            const inside = frac > FLUENCY.EDGE && frac < 1 - FLUENCY.EDGE;
            if (inside && speed[i] < peak * FLUENCY.LOW) {
                if (since === null) since = samples[i].t;
            } else {
                // 慢下來的那段結束（又動了，或走到最低、最高附近）：夠久、而且是在途中又動起來的才算卡一下
                if (since !== null && inside && samples[i].t - since >= FLUENCY.HOLD_MS) stalls++;
                since = null;
            }
        }
    }
    return judged ? stalls : null;
}

// series：repSeries() 的結果（計次的動作）。回傳 null（棒式、不是計次）或
//   { stalls: { judged（看了幾下）, list: [第幾下…] } 或 null（這個動作不看）,
//     rhythm: { count, within, average（秒，就是 series.tempo）, steady } 或 null（不到 5 下） }
// 中途停住超過 10 秒的那一下（session.js 的 PAUSE_REP）不算進節奏，和「每下約幾秒」一樣
export function fluencyOf(series) {
    if (!series || series.kind !== 'reps' || !Array.isArray(series.reps) || !series.reps.length) return null;
    const reps = series.reps;
    const judged = reps.filter(r => Number.isInteger(r.stalls));
    const stalls = judged.length ? { judged: judged.length, list: judged.filter(r => r.stalls > 0).map(r => r.n) } : null;
    const secs = reps.map(r => r.seconds).filter(v => v !== null && v > 0 && v <= PAUSE_REP);
    let rhythm = null;
    if (secs.length >= FLUENCY.MIN_REPS && series.tempo > 0) {
        const m = series.tempo;
        const within = secs.filter(v => Math.abs(v - m) <= m * FLUENCY.BAND + 1e-9).length;
        rhythm = { count: secs.length, within, average: m, steady: within >= secs.length * FLUENCY.STEADY - 1e-9 };
    }
    return { stalls, rhythm };
}

// 總結的那一句
export function fluencyLine(f) {
    if (!f) return '';
    const parts = [];
    if (f.rhythm) {
        parts.push((f.rhythm.steady ? '節奏穩' : '忽快忽慢') + '（' + f.rhythm.count + ' 下有 ' + f.rhythm.within + ' 下和平均的 ' + f.rhythm.average + ' 秒差不到 2 成）');
    } else {
        parts.push('做 ' + FLUENCY.MIN_REPS + ' 下以上才看節奏');
    }
    if (f.stalls) {
        parts.push(f.stalls.list.length
            ? f.stalls.list.length + ' 下中途卡了一下（' + f.stalls.list.map(n => '第 ' + n + ' 下').join('、') + '）'
            : '每一下都很順，沒有卡住');
    }
    return '動作流暢度：' + parts.join('；');
}
