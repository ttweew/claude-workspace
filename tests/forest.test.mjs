// AI 模型（11/3）：Random Forest（js/analysis/forest.js）
//   分得開的資料學得會、看不到的數字也能拿來分、同樣的 seed 長出一樣的森林、模型存成 JSON 再讀回來猜得一樣、被改壞的特徵當成看不到
import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, trainForest, voteForest, trainModel, predictModel, modelClasses, featureUse, MISSING } from '../js/analysis/forest.js';
import { featureColumns } from '../js/analysis/features.js';

test('亂數：同一個起點每次一樣、0～1 之間；起點只差 1 也各走各的', () => {
    const a = rng(7), b = rng(7), c = rng(8);
    const xs = Array.from({ length: 1000 }, a);
    assert.deepEqual(Array.from({ length: 1000 }, b), xs);
    assert.ok(xs.every(x => x >= 0 && x < 1));
    // 起點差 1 的兩串：前 1000 個的相關係數接近 0（11/2 合成資料用的亂數，起點接近時幾乎一樣）
    const ys = Array.from({ length: 1000 }, c);
    const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
    assert.ok(Math.abs(sxy / Math.sqrt(sxx * syy)) < 0.1);
    assert.ok(Math.abs(mx - 0.5) < 0.05);
});

// 合成的小資料：兩個特徵，x0 > 5 是第 1 類；x1 是雜訊
const toy = (n, seed) => {
    const r = rng(seed);
    const X = [], y = [];
    for (let i = 0; i < n; i++) {
        const x0 = r() * 10, x1 = r() * 10;
        X.push([x0, x1]);
        y.push(x0 > 5 ? 1 : 0);
    }
    return { X, y };
};

test('分得開的資料學得會：一個門檻、兩個特徵一起看（斜的界線）、三類', () => {
    const { X, y } = toy(200, 1);
    const forest = trainForest(X, y, 2, { trees: 30, seed: 3 });
    const test = toy(200, 2);
    const hit = test.X.filter((x, i) => (voteForest(forest, x, 2)[1] > 0.5 ? 1 : 0) === test.y[i]).length;
    assert.ok(hit >= 196, hit + '／200');
    // 兩個特徵一起看：x0 + x1 > 10
    const r = rng(5);
    const X2 = Array.from({ length: 400 }, () => [r() * 10, r() * 10]);
    const y2 = X2.map(([a, b]) => (a + b > 10 ? 1 : 0));
    const f2 = trainForest(X2, y2, 2, { trees: 60, depth: 8, seed: 1 });
    const hit2 = X2.filter((x, i) => (voteForest(f2, x, 2)[1] > 0.5 ? 1 : 0) === y2[i]).length;
    assert.ok(hit2 >= 380, hit2 + '／400');
    // 三類：x0 < 3、3～7、> 7
    const y3 = X.map(([a]) => (a < 3 ? 0 : a < 7 ? 1 : 2));
    const f3 = trainForest(X, y3, 3, { trees: 30, seed: 2 });
    const p = voteForest(f3, [8.5, 1], 3);
    assert.equal(p.indexOf(Math.max(...p)), 2);
    assert.ok(Math.abs(p.reduce((s, v) => s + v, 0) - 1) < 1e-9);
});

test('看不到的數字（null）也能拿來分；同樣的 seed 長出一樣的森林', () => {
    // 第 1 類的 x0 都看不到（像棒式整次都沒一直線，髖部晃動是 null）
    const X = [], y = [];
    for (let i = 0; i < 40; i++) { X.push([i % 2 ? null : 1 + (i % 5), 3]); y.push(i % 2); }
    const forest = trainForest(X, y, 2, { trees: 20, seed: 9 });
    assert.ok(voteForest(forest, [null, 3], 2)[1] > 0.9);
    assert.ok(voteForest(forest, [2, 3], 2)[0] > 0.9);
    // 被改壞的（不是數字）也當成看不到
    assert.deepEqual(voteForest(forest, ['2', 3], 2), voteForest(forest, [MISSING, 3], 2));
    assert.deepEqual(voteForest(forest, [NaN, 3], 2), voteForest(forest, [null, 3], 2));
    // 同樣的 seed 一模一樣；換 seed 抽到的資料、看的特徵不一樣（上面那組一刀就分完，換 seed 也一樣，所以用有雜訊的資料）
    const t = toy(100, 3);
    const once = JSON.stringify(trainForest(t.X, t.y, 2, { trees: 20, seed: 9 }));
    assert.equal(JSON.stringify(trainForest(t.X, t.y, 2, { trees: 20, seed: 9 })), once);
    assert.notEqual(JSON.stringify(trainForest(t.X, t.y, 2, { trees: 20, seed: 10 })), once);
});

test('只有一種、沒有資料、每一下都一樣：不會當掉', () => {
    const one = trainForest([[1], [2], [3]], [0, 0, 0], 2, { trees: 5 });
    assert.deepEqual(voteForest(one, [9], 2), [1, 0]);
    assert.deepEqual(trainForest([], [], 2), []);
    assert.deepEqual(voteForest([], [1], 2), [0, 0]);
    // 特徵都一樣、標記不一樣：分不開，葉子記比例
    const same = trainForest([[1], [1], [1], [1]], [0, 1, 0, 1], 2, { trees: 50, seed: 4 });
    const p = voteForest(same, [1], 2);
    assert.ok(p[0] > 0.2 && p[1] > 0.2);
});

// 一個動作的模型：dataset 的每一列（features 物件＋condition）
const row = (condition, lean, heel) => ({ workout: 'squat', condition, features: { min: 90, seconds: 2, similarity: 92, sway: 2, stalls: 0, lean, heel } });

test('一個動作的模型：特徵照 featureColumns、標記做對在前面；存成 JSON 再讀回來猜得一樣；被改壞的特徵當成看不到', () => {
    assert.deepEqual(modelClasses('squat'), ['good', 'lean', 'heel']);
    assert.deepEqual(modelClasses('plank'), ['good', 'sag', 'pike']);
    assert.deepEqual(modelClasses('free'), ['good']);
    for (const id of ['constructor', '__proto__', '']) assert.deepEqual(modelClasses(id), []);
    const rows = [];
    for (let i = 0; i < 20; i++) {
        rows.push(row('good', 25 + (i % 10), i % 6));
        rows.push(row('lean', 45 + (i % 15), i % 6));
        rows.push(row('heel', 25 + (i % 10), 15 + (i % 10)));
    }
    rows.push({ workout: 'lunge', condition: 'knee', features: {} }, row('constructor', 30, 1));
    const model = trainModel('squat', rows, { trees: 40, seed: 1 });
    assert.equal(model.type, 'random-forest');
    assert.deepEqual(model.features, featureColumns('squat').map(c => c.key));
    assert.deepEqual(model.classes, ['good', 'lean', 'heel']);
    assert.equal(model.trees.length, 40);
    assert.equal(predictModel(model, row('', 30, 2).features).label, 'good');
    assert.equal(predictModel(model, row('', 55, 2).features).label, 'lean');
    assert.equal(predictModel(model, row('', 30, 22).features).label, 'heel');
    // JSON 存起來再讀回來（11/4 放進網站）：猜得一樣
    const back = JSON.parse(JSON.stringify(model));
    for (const r of rows.slice(0, 30)) assert.deepEqual(predictModel(back, r.features), predictModel(model, r.features));
    // 被改壞的：特徵不是物件、數字是文字、多了奇怪的欄位
    for (const f of [null, 'x', 42, { lean: '55' }, { constructor: 1 }]) {
        const p = predictModel(model, f);
        assert.ok(model.classes.includes(p.label));
        assert.ok(Math.abs(p.probs.reduce((s, v) => s + v, 0) - 1) < 1e-9);
    }
    // 最常看的數字：上身前傾、腳跟離地（其他特徵每一下都一樣，分不了）
    assert.deepEqual(featureUse(model).map(u => u.key).sort(), ['heel', 'lean']);
});
