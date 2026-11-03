// AI 模型（11/3，計畫書研究目標 3「Random Forest 品質分類」）：隨機森林判斷每一下是做對，還是做了哪一種錯
// 很多棵「決策樹」投票。每棵樹用抽樣的資料長出來（有放回地抽，同一下可能抽到好幾次），每次分岔只看隨機挑的幾個特徵，
// 所以每棵樹都不太一樣，投票的結果比一棵樹穩。不用安裝套件（網站不打包）：訓練（tools/train.mjs）和預測（11/4 放進網站）都用這個檔案
// 特徵：js/analysis/features.js 每個動作的欄位（量到的數字；規則的判斷、第幾下、受測者都不給模型看）
// 看不到的數字（null）換成 MISSING：樹可以把「看不到」當成一種情況分開（例如棒式整次都沒一直線時，髖部晃動是 null）
// 同樣的資料、同樣的 seed，長出來的森林一模一樣（測試、放進網站的模型才對得起來）
import { featureColumns } from './features.js';
import { FORM_RULES } from './form.js';
import { isWorkout } from './workouts.js';

export const MISSING = -1e6;
const value = v => (typeof v === 'number' && Number.isFinite(v) ? v : MISSING);

// 亂數（mulberry32）：起點只差一點點也會各走各的（11/2 合成資料用乘 16807 的亂數，起點接近時好幾串幾乎一樣）
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 吉尼不純度：這一堆裡隨便抽兩下、標記不一樣的機會（0 是全部同一種）
function gini(counts, n) {
    if (!n) return 0;
    let sum = 0;
    for (const c of counts) sum += (c / n) * (c / n);
    return 1 - sum;
}

const leafOf = (counts, n) => ({ p: counts.map(c => (n ? c / n : 0)) });

// 這一堆最好的分法：每個特徵試每一個「兩個相鄰數字的中間」，分開後兩邊越純越好
// 先看隨機挑的 m 個特徵；這幾個都分不開（例如每一下都一樣）就繼續看下一個，直到找到能分的
function bestSplit(rows, y, k, idx, counts, impurity, o) {
    const d = rows[0].length;
    const order = [...Array(d).keys()];
    for (let i = d - 1; i > 0; i--) {
        const j = Math.floor(o.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    const n = idx.length;
    let best = null;
    for (let j = 0; j < d; j++) {
        if (j >= o.m && best) break;
        const f = order[j];
        const sorted = idx.map(i => [rows[i][f], y[i]]).sort((a, b) => a[0] - b[0]);
        const left = new Array(k).fill(0), right = [...counts];
        for (let s = 0; s < n - 1; s++) {
            left[sorted[s][1]]++;
            right[sorted[s][1]]--;
            if (sorted[s][0] === sorted[s + 1][0]) continue;
            const nl = s + 1, nr = n - nl;
            if (nl < o.leaf || nr < o.leaf) continue;
            const g = (nl * gini(left, nl) + nr * gini(right, nr)) / n;
            if (g < impurity - 1e-12 && (!best || g < best.g)) best = { f, t: (sorted[s][0] + sorted[s + 1][0]) / 2, g };
        }
    }
    return best;
}

// 長一棵樹：分到全部同一種、太少下、太深就停（葉子記每一種的比例）
function grow(rows, y, k, idx, level, o) {
    const counts = new Array(k).fill(0);
    for (const i of idx) counts[y[i]]++;
    const n = idx.length;
    const impurity = gini(counts, n);
    if (level >= o.depth || n < 2 * o.leaf || impurity === 0) return leafOf(counts, n);
    const best = bestSplit(rows, y, k, idx, counts, impurity, o);
    if (!best) return leafOf(counts, n);
    const left = [], right = [];
    for (const i of idx) (rows[i][best.f] <= best.t ? left : right).push(i);
    return { f: best.f, t: best.t, l: grow(rows, y, k, left, level + 1, o), r: grow(rows, y, k, right, level + 1, o) };
}

// 訓練：X 每一列是一下的特徵（數字或 null），y 是標記的編號（0～k−1）
// trees 幾棵樹（100）、depth 最多幾層（6）、leaf 葉子最少幾下（2）、features 每次分岔看幾個特徵（預設 √特徵數，取整數往上）、seed
// 資料很少（例如一個動作只有幾十下）：樹不深、葉子至少 2 下，免得把每一下的小差別都背下來
export function trainForest(X, y, k, { trees = 100, depth = 6, leaf = 2, features = null, seed = 1 } = {}) {
    const rows = X.map(r => r.map(value));
    if (!rows.length) return [];
    const m = features || Math.max(1, Math.ceil(Math.sqrt(rows[0].length)));
    const random = rng(seed);
    const forest = [];
    for (let t = 0; t < trees; t++) {
        const idx = Array.from({ length: rows.length }, () => Math.floor(random() * rows.length));
        forest.push(grow(rows, y, k, idx, 0, { depth, leaf, m, random }));
    }
    return forest;
}

// 每棵樹走到葉子，平均每一種的比例（投票）
export function voteForest(forest, x, k) {
    const sum = new Array(k).fill(0);
    if (!forest.length) return sum;
    const v = x.map(value);
    for (let node of forest) {
        while (!node.p) node = v[node.f] <= node.t ? node.l : node.r;
        node.p.forEach((p, i) => { sum[i] += p; });
    }
    return sum.map(s => s / forest.length);
}

// 數字留到小數第 4 位（特徵都只到第 1 位，分岔的門檻是兩個數字的中間：不會改到判斷），模型檔小一點
const r4 = v => Math.round(v * 1e4) / 1e4;
const compact = node => (node.p ? { p: node.p.map(r4) } : { f: node.f, t: r4(node.t), l: compact(node.l), r: compact(node.r) });

// ---------- 一個動作的模型（存成 JSON；11/4 放進網站） ----------
// { type: 'random-forest', version: 1, workout, features: [特徵的 key], classes: ['good', 錯誤代號…], trees }
// classes：做對在第一個，錯誤照 form.js 的規則順序
export function modelClasses(workout) {
    return isWorkout(workout) && Object.prototype.hasOwnProperty.call(FORM_RULES, workout) ? ['good', ...FORM_RULES[workout].map(r => r.id)] : [];
}

// rows：js/data/dataset.js 的資料表（只用這個動作、標記認得的列）
export function trainModel(workout, rows, options = {}) {
    const features = featureColumns(workout).map(c => c.key);
    const classes = modelClasses(workout);
    const used = rows.filter(r => r.workout === workout && classes.includes(r.condition));
    const X = used.map(r => features.map(key => r.features[key]));
    const y = used.map(r => classes.indexOf(r.condition));
    const trees = trainForest(X, y, classes.length, options).map(compact);
    return { type: 'random-forest', version: 1, workout, features, classes, trees };
}

// 模型最常看哪幾個數字：每個特徵在所有樹裡分岔了幾次、門檻的中位數（報告時說得出模型在看什麼、學到的門檻和規則差多少）
// 回傳 [{ key, splits, threshold }]，分岔多的在前面；沒用到的不列
export function featureUse(model) {
    const used = model.features.map(() => []);
    const walk = node => {
        if (node.p) return;
        used[node.f].push(node.t);
        walk(node.l);
        walk(node.r);
    };
    model.trees.forEach(walk);
    const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
    return model.features.map((key, i) => ({ key, splits: used[i].length, threshold: used[i].length ? median(used[i]) : null }))
        .filter(u => u.splits).sort((a, b) => b.splits - a.splits);
}

// 一下的特徵（dataset 每一列的 features）→ { label（猜的標記）, probs（每一種的比例，照 classes） }
// 特徵被改壞、沒有的當成看不到；同分時照 classes 的順序（做對優先）
export function predictModel(model, features) {
    const f = features && typeof features === 'object' ? features : {};
    const x = model.features.map(key => (Object.prototype.hasOwnProperty.call(f, key) ? f[key] : null));
    const probs = voteForest(model.trees, x, model.classes.length);
    let best = 0;
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
    return { label: model.classes[best], probs };
}
