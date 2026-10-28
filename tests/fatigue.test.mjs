// 疲勞分析（js/analysis/fatigue.js，10/28）：前段和後段比，門檻剛好、差一點；不夠 6 下、棒式；運動中的提醒只講一次
import test from 'node:test';
import assert from 'node:assert/strict';
import { fatigueOf, fatigueLine, fatigueNotes, FatigueWatch, FATIGUE } from '../js/analysis/fatigue.js';
import { repSeries } from '../js/analysis/rep-series.js';
import { summarize } from '../js/analysis/session.js';

// 一組深蹲：每一下 [最低角度, 秒數, 錯誤, 相似度, 這一下之前停了幾秒]，兩下之間平常隔 1 秒
function set(list) {
    let t = 0;
    return list.map(([min, sec, errors = [], similarity = 90, wait = 0]) => {
        t += wait;
        const r = { min, depth: min <= 90 ? 'good' : min <= 110 ? 'close' : 'shallow', start: t, end: t + sec, errors, similarity };
        t += sec + 1;
        return r;
    });
}
const steady = (n, min = 85, sec = 2) => Array.from({ length: n }, () => [min, sec]);
const of = items => fatigueOf(repSeries('squat', items));

test('一樣的速度、深度：差不多，沒有疲勞的跡象；10 下時前段第 1～3 下、後段第 8～10 下', () => {
    const f = of(set(steady(10)));
    assert.equal(f.enough, true);
    assert.deepEqual([f.front.from, f.front.to, f.back.from, f.back.to], [1, 3, 8, 10]);
    assert.deepEqual(f.signs, []);
    assert.equal(fatigueLine(f), '疲勞分析：前段（第 1～3 下）和後段（第 8～10 下）差不多，沒有看到疲勞的跡象');
});

test('變慢：後段的秒數剛好 1.5 倍算（2.0 → 3.0 秒）、2.9 秒不算', () => {
    const slow = sec => of(set([...steady(6), [85, sec], [85, sec], [85, sec]]));
    assert.deepEqual(slow(3).signs, [{ key: 'slower', text: '變慢 50%' }]);
    assert.deepEqual(slow(2.9).signs, []);
    // 1.4 × 1.5 在電腦裡是 2.0999…：後段 2.1 秒要算剛好 1.5 倍
    const f = of(set([[85, 1.4], [85, 1.4], [85, 1.4], ...steady(3), [85, 2.1], [85, 2.1], [85, 2.1]]));
    assert.equal(f.signs[0].key, 'slower');
    assert.equal(fatigueLine(slow(3)), '疲勞分析：後段（第 7～9 下）比前段（第 1～3 下）變慢 50%，可能累了');
});

test('變淺：後段的最低角度大 15° 算、14° 不算；變深不算', () => {
    const shallow = min => of(set([...steady(6), [min, 2], [min, 2], [min, 2]]));
    assert.deepEqual(shallow(100).signs, [{ key: 'shallower', text: '變淺 15°' }]);
    assert.deepEqual(shallow(99).signs, []);
    assert.deepEqual(shallow(60).signs, []);
});

test('錯誤變多：比例多一半、而且至少多 2 下；寫出後段最多的錯誤', () => {
    const errs = (...back) => of(set([...steady(6), ...back.map(e => [85, 2, e])]));
    assert.deepEqual(errs(['lean'], ['lean', 'heel'], []).signs, [{ key: 'errors', text: '錯誤變多（上身前傾）' }]);
    assert.deepEqual(errs(['lean'], [], []).signs, []);
    // 6 下時前後各 2 下：後段 1／2 下有錯誤（多 50%，但只多 1 下）不算
    assert.deepEqual(of(set([...steady(4), [85, 2, ['lean']], [85, 2]])).signs, []);
});

test('相似度掉 12 分算、11 分不算；有一段沒有相似度就不比', () => {
    const sim = s => of(set([...steady(6), [85, 2, [], s], [85, 2, [], s], [85, 2, [], s]]));
    assert.deepEqual(sim(78).signs, [{ key: 'similarity', text: '和示範動作的相似度掉 12 分' }]);
    assert.deepEqual(sim(79).signs, []);
    assert.deepEqual(sim(null).signs, []);
});

test('同時有好幾種跡象：照變慢、變淺、錯誤、相似度的順序寫', () => {
    const f = of(set([...steady(6), [105, 3.2, ['lean'], 70], [108, 3.4, ['lean'], 72], [110, 3, [], 74]]));
    // 後段 3 下有 2 下有錯誤、前段 0 下：也算錯誤變多
    assert.deepEqual(f.signs.map(s => s.key), ['slower', 'shallower', 'errors', 'similarity']);
    assert.equal(fatigueLine(f), '疲勞分析：後段（第 7～9 下）比前段（第 1～3 下）變慢 60%、變淺 23°、錯誤變多（上身前傾）、和示範動作的相似度掉 18 分，可能累了');
});

test('不夠 6 下：寫要做幾下；棒式、自由模式、沒有資料：不比', () => {
    const f = of(set(steady(5)));
    assert.deepEqual(f, { enough: false, count: 5, need: FATIGUE.MIN_REPS, rests: null });
    assert.equal(fatigueLine(f), '疲勞分析：做 6 下以上才比前段和後段（這次 5 下）');
    assert.equal(fatigueOf(repSeries('plank', [{ seconds: 30, errors: [] }])), null);
    assert.equal(fatigueOf(repSeries('free', set(steady(10)))), null);
    assert.equal(fatigueOf(null), null);
    assert.equal(fatigueLine(null), '');
});

test('被改壞的那一下不算進去，編號照原本的（和每一下的表格一樣）', () => {
    const items = set(steady(9));
    items[0].min = NaN;
    const f = of(items);
    // 剩 8 下：前後各 2 下，前段是第 2、3 下
    assert.deepEqual([f.front.from, f.front.to, f.back.from, f.back.to], [2, 3, 8, 9]);
});

test('運動中的提醒：越來越淺時講一次，之後不再講；新的一組重新算；變慢、錯誤變多不在運動中提醒', () => {
    const watch = new FatigueWatch();
    const items = set([...steady(6), [100, 3], [100, 3], [100, 3]]);
    // 做到第 6 下都正常
    for (let n = 1; n <= 6; n++) assert.equal(watch.check('squat', items.slice(0, n)), null, '第 ' + n + ' 下');
    // 第 7 下：前段（1、2）、後段（6、7）平均 93°，淺 8°、慢 25%，還不算
    assert.equal(watch.check('squat', items.slice(0, 7)), null);
    // 第 8 下：後段（7、8）100°，淺 15°（也慢 50%）→ 講變淺
    assert.equal(watch.check('squat', items.slice(0, 8)), 'shallower');
    assert.equal(watch.check('squat', items), null, '講過就不再講');
    watch.reset();
    assert.equal(watch.check('squat', items), 'shallower');
    // 只有變慢、錯誤變多：不在運動中提醒（節奏本來就會忽快忽慢；錯誤每一下本來就會講）
    assert.equal(new FatigueWatch().check('squat', set([...steady(6), [85, 3], [85, 3], [85, 3]])), null);
    assert.equal(new FatigueWatch().check('squat', set([...steady(6), [85, 2, ['lean']], [85, 2, ['lean']], [85, 2, ['lean']]])), null);
});

// ---------- 10/28 保養：極端情況（只做 1 下、做 100 下、中途停很久） ----------

test('只做 1 下：寫要做 6 下以上；沒有補充', () => {
    const f = of(set(steady(1)));
    assert.deepEqual(f, { enough: false, count: 1, need: 6, rests: null });
    assert.equal(fatigueLine(f), '疲勞分析：做 6 下以上才比前段和後段（這次 1 下）');
    assert.deepEqual(fatigueNotes(f), []);
});

test('做 100 下：前段第 1～33 下、後段第 68～100 下；做 1000 下時運動中的檢查也很快', () => {
    const f = of(set([...steady(50), ...Array.from({ length: 50 }, () => [105, 3.2])]));
    assert.deepEqual([f.front.from, f.front.to, f.back.from, f.back.to], [1, 33, 68, 100]);
    assert.deepEqual(f.signs.map(s => s.key), ['slower', 'shallower']);
    // 每一下做完都檢查一次（從頭算一遍）：做到第 1000 下時檢查一次的時間
    const items = set(steady(1000));
    const watch = new FatigueWatch();
    const t0 = performance.now();
    assert.equal(watch.check('squat', items), null);
    assert.ok(performance.now() - t0 < 50, '1000 下檢查一次 ' + (performance.now() - t0).toFixed(1) + ' 毫秒');
});

test('中途休息 30 秒以上：分開算，只比最長的一段；29 秒不算休息', () => {
    // 前 6 下、休息 40 秒（兩下之間本來就隔 1 秒＋多停 39 秒）、後 8 下（休息後的第 1 下是第 7 下）
    const rest = wait => set([...steady(6), [85, 2, [], 90, wait], ...steady(7)]);
    const f = of(rest(39));
    assert.deepEqual(f.rests, { count: 1, longest: 40, from: 7, to: 14 });
    assert.deepEqual([f.front.from, f.front.to, f.back.from, f.back.to], [7, 8, 13, 14]);
    assert.deepEqual(fatigueNotes(f), ['中途休息了 40 秒：休息前後分開算，只比連續做的第 7～14 下']);
    // 29 秒：一樣是同一組；30 秒算休息
    assert.equal(of(rest(28)).rests, null);
    assert.equal(of(rest(29)).rests.longest, 30);
    // 休息兩次：寫幾次、最久幾秒；一樣長的兩段取後面的
    const two = of(set([...steady(6), [85, 2, [], 90, 45], ...steady(5), [85, 2, [], 90, 59.7], ...steady(5)]));
    assert.deepEqual(two.rests, { count: 2, longest: 60, from: 13, to: 18 });
    assert.equal(fatigueNotes(two)[0], '中途休息了 2 次（最久 60 秒）：休息前後分開算，只比連續做的第 13～18 下');
});

test('中途休息、每一段都不到 6 下：寫最長的一段只有幾下（一樣長取後面的）', () => {
    const f = of(set([...steady(4), [85, 2, [], 90, 59], ...steady(3)]));
    assert.deepEqual(f, { enough: false, count: 4, need: 6, rests: { count: 1, longest: 60, from: 5, to: 8 } });
    assert.equal(fatigueLine(f), '疲勞分析：中途休息過，最長的一段只有 4 下（第 5～8 下），要連續做 6 下以上才比前段和後段');
    assert.deepEqual(fatigueNotes(f), []);
});

test('一下裡面停超過 10 秒（中途停住）：不算進每下幾秒，寫出來；不會變成「慢 900%」', () => {
    const f = of(set([...steady(8), [85, 40]]));
    assert.deepEqual(f.signs, []);
    assert.equal(f.back.seconds, 2);
    assert.deepEqual(f.back.paused, [{ n: 9, seconds: 40 }]);
    assert.deepEqual(fatigueNotes(f), ['第 9 下中途停住（40 秒），不算進每下幾秒']);
    // 10 秒還算一般的一下
    assert.deepEqual(of(set([...steady(8), [85, 10]])).back.paused, []);
    // 總結的「每下約幾秒」、圖的平均線也不算停住的那一下（同一個數字），每一下都停住時才全部算
    const items = set([...steady(8), [85, 40]]);
    assert.equal(summarize('squat', items, 0, 1).tempo, 2);
    assert.equal(repSeries('squat', items).tempo, 2);
    assert.equal(summarize('squat', set([[85, 20], [85, 30]]), 0, 1).tempo, 25);
    assert.equal(repSeries('squat', set([[85, 20], [85, 30]])).tempo, 25);
});

test('秒數被改壞的那一下：不知道停多久，不切開', () => {
    const items = set([...steady(6), [85, 2, [], 90, 59], ...steady(7)]);
    assert.equal(of(items).rests.longest, 60);
    items[6].start = 'x';
    assert.equal(of(items).rests, null);
});

test('運動中的提醒：休息過後重新算，休息後又越來越淺會再提醒一次', () => {
    const tiredSet = (wait = 0) => [[85, 2, [], 90, wait], ...steady(5), [100, 2], [100, 2], [100, 2]];
    const items = set([...tiredSet(), ...tiredSet(44)]);
    const watch = new FatigueWatch();
    const said = [];
    for (let n = 1; n <= items.length; n++) if (watch.check('squat', items.slice(0, n))) said.push(n);
    // 第 8 下（第一段）、第 17 下（休息後的第 8 下）
    assert.deepEqual(said, [8, 17]);
});
