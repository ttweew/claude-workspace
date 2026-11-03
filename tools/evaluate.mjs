// AI 模型和規則、DTW 比（11/3）：每一下三種判斷法各猜什麼、猜對幾下
//   AI 模型（js/analysis/forest.js）：猜這一下是做對，還是哪一種錯
//   規則（網站原本的判斷，dataset 的 ruleErrors）：沒有報錯就是做對；報了錯就是那一種（報了好幾種時，取超過門檻最多的）
//   DTW（和示範動作相似，0～100）：只分得出做對、做錯（分不出哪一種錯）；相似度到門檻以上算做對。
//     門檻用訓練資料挑（猜對最多的那個），不看測試資料；棒式沒有相似度，不比
// 訓練 AI 模型用（tools/），網站不用
import { errorRule } from '../js/analysis/form.js';
import { predictModel } from '../js/analysis/forest.js';

// 規則的判斷：'good' 或錯誤代號
export function rulePrediction(row) {
    const errors = row.ruleErrors.filter(id => errorRule(row.workout, id));
    if (!errors.length) return 'good';
    // 超過門檻幾倍（特徵 ÷ 門檻；特徵和門檻同一個單位，見 features.js）；看不到數字的排後面
    const ratio = id => {
        const rule = errorRule(row.workout, id);
        const v = row.features[id];
        return typeof v === 'number' && rule.why && rule.why.limit > 0 ? v / rule.why.limit : 0;
    };
    return errors.reduce((best, id) => (ratio(id) > ratio(best) ? id : best));
}

// DTW 的門檻：訓練資料裡，「相似度 ≥ 門檻算做對」猜對最多的門檻（一樣多時取比較低的）；沒有相似度的回傳 null
export function fitSimilarity(rows) {
    const used = rows.filter(r => typeof r.features.similarity === 'number');
    if (!used.length) return null;
    const values = [...new Set(used.map(r => r.features.similarity))].sort((a, b) => a - b);
    let best = null;
    for (const t of values) {
        const hit = used.filter(r => (r.features.similarity >= t) === (r.condition === 'good')).length;
        if (!best || hit > best.hit) best = { t, hit };
    }
    return best.t;
}

// DTW 的判斷：'good'、'wrong'（做錯，分不出哪一種），沒有相似度或沒有門檻時 null
export function similarityPrediction(row, threshold) {
    const s = row.features.similarity;
    if (threshold === null || typeof s !== 'number') return null;
    return s >= threshold ? 'good' : 'wrong';
}

// 成績：rows 和 predictions（每一下猜的，null 是不比）一一對應
//   n：比了幾下；kind：猜對種類（做對、哪一種錯）幾下；binary：做對、做錯分對了幾下；
//   good：做對的判成做對幾下／幾下；wrong：做錯的判成做錯（不管哪一種）幾下／幾下；perClass：每一種標記猜對幾下／幾下
//   kinds: false（DTW）：只分做對、做錯，種類是 null（「—」）
export function score(rows, predictions, { kinds = true } = {}) {
    const out = { n: 0, kind: 0, binary: 0, good: { hit: 0, n: 0 }, wrong: { hit: 0, n: 0 }, perClass: {} };
    rows.forEach((row, i) => {
        const p = predictions[i];
        if (p === null || p === undefined) return;
        out.n++;
        const label = row.condition;
        const okBinary = (p === 'good') === (label === 'good');
        if (okBinary) out.binary++;
        if (p === label) out.kind++;
        const side = label === 'good' ? out.good : out.wrong;
        side.n++;
        if (okBinary) side.hit++;
        const c = out.perClass[label] || (out.perClass[label] = { hit: 0, n: 0 });
        c.n++;
        if (p === label) c.hit++;
    });
    if (!kinds) {
        out.kind = null;
        for (const c of Object.values(out.perClass)) c.hit = null;
    }
    return out;
}

// AI 模型學到的門檻（11/3：說得出模型為什麼和規則不一樣）：拿訓練資料裡做對的那幾下每個數字的中位數當「標準的一下」，
// 只把這種錯誤的數字從那裡每次加 0.1 慢慢加大，加到多少模型改猜成這種錯（和規則的門檻同一個單位）；加到規則門檻的 3 倍還不改，回傳 null
// 伏地挺身、棒式的腰往下彎和屁股往上翹是同一個數字的正負（features.js），一起動，不然會試到真人做不出來的姿勢
const MIRROR = { sag: 'pike', pike: 'sag' };
export function learnedLimit(model, rows, error) {
    const rule = errorRule(model.workout, error);
    const good = rows.filter(r => r.workout === model.workout && r.condition === 'good');
    if (!rule || !rule.why || !good.length) return null;
    const base = {};
    for (const key of model.features) {
        const v = good.map(r => r.features[key]).filter(x => typeof x === 'number').sort((a, b) => a - b);
        base[key] = v.length ? v[Math.floor(v.length / 2)] : null;
    }
    const start = typeof base[error] === 'number' ? Math.round(base[error] * 10) : 0;
    for (let i = start; i <= Math.round(rule.why.limit * 30); i++) {
        const f = { ...base, [error]: i / 10 };
        if (MIRROR[error]) f[MIRROR[error]] = -i / 10;
        if (predictModel(model, f).label === error) return i / 10;
    }
    return null;
}

// 「38／40（95%）」；分母是 0 或不比的時候「—」
export function ratio(hit, n) {
    return hit === null || !n ? '—' : hit + '／' + n + '（' + Math.round(hit / n * 100) + '%）';
}
