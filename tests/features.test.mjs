// AI 模型的資料（11/2）：每一下的特徵（js/analysis/features.js）
//   持續 0.4 秒的最大值怎麼算、每個動作有哪些欄位、被改壞的數字當成沒有
//   規則說這一下有錯 ⇔ 這個特徵 > 門檻（合成的四位受測者、四個動作，每一下每條規則都對得上）
import test from 'node:test';
import assert from 'node:assert/strict';
import { heldMax, FeatureMeter, featureColumns } from '../js/analysis/features.js';
import { FORM_RULES, FORM_HOLD, bendDegrees } from '../js/analysis/form.js';
import { analyzeOne } from '../js/data/report-core.js';
import { syntheticSubject } from './synthetic-sets.mjs';

// 每 step 毫秒一格
const series = (values, step = 100) => values.map((v, i) => ({ t: i * step, v }));

test('持續 0.4 秒的最大值：要連續 0.4 秒以上都這麼大才算（和規則報錯誤一樣）', () => {
    assert.equal(FORM_HOLD.showMs, 400);
    assert.equal(heldMax([]), null);
    // 每 100 毫秒一格：頭尾差 400 毫秒要 5 格
    assert.equal(heldMax(series([10, 10, 10, 10])), null);
    assert.equal(heldMax(series([10, 10, 10, 10, 10])), 10);
    // 一閃而過的大數字（200 毫秒）不算
    assert.equal(heldMax(series([20, 20, 20, 90, 90, 20, 20, 20])), 20);
    // 慢慢變大再變小：撐得住 0.4 秒的那幾段裡，最小值最大的那段（30、40、50、40、30）
    assert.equal(heldMax(series([0, 10, 20, 30, 40, 50, 40, 30, 20, 10, 0])), 30);
    // 中間看不到（null）就斷開：前後各 300 毫秒都不夠
    assert.equal(heldMax(series([50, 50, 50, 50, null, 50, 50, 50, 50])), null);
    assert.equal(heldMax(series([50, 50, 50, 50, null, 50, 50, 50, 50, 50])), 50);
    // 照時間算，不是照格數（手機慢的時候一秒不到 30 格）
    assert.equal(heldMax([{ t: 0, v: 30 }, { t: 400, v: 30 }]), 30);
    assert.equal(heldMax([{ t: 0, v: 30 }, { t: 399, v: 30 }]), null);
    // 負數也可以（例如腳跟比站直時還低一點）
    assert.equal(heldMax(series([-3, -2, -1, -2, -3])), -3);
});

test('每一下量的數字：沒有規則的動作、看不到人時是 null；棒式只看第一次到最後一次一直線之間', () => {
    assert.deepEqual(new FeatureMeter('free').take(), { features: {} });
    assert.deepEqual(new FeatureMeter('constructor').take(), { features: {} });
    const squat = new FeatureMeter('squat');
    for (let t = 0; t <= 1000; t += 50) squat.add(null, t);
    assert.deepEqual(squat.take(), { features: { lean: null, heel: null } });
    // 規則不檢查的時候不量：深蹲膝蓋彎到 130° 以下才看上身前傾（腳跟是 150° 以下）
    for (let t = 0; t <= 1000; t += 50) squat.add({ knee: 140, lean: 70, heel: 0.02 }, t);
    assert.deepEqual(squat.take(), { features: { lean: null, heel: 2 } });

    // 棒式（m 只放規則用到的）：趴下準備 0.5 秒屁股翹、一直線 1 秒、起身 0.5 秒屁股翹（10/20 實測做對的組就是這樣）
    const plank = new FeatureMeter('plank');
    const m = sag => ({ lying: true, sag });
    for (let t = 0; t < 500; t += 50) plank.add(m(-0.2), t, false);
    for (let t = 500; t <= 1500; t += 50) plank.add(m(0.01), t, true);
    for (let t = 1550; t < 2100; t += 50) plank.add(m(-0.2), t, false);
    const round1 = v => Math.round(v * 10) / 10;
    assert.deepEqual(plank.take(), { features: { sag: round1(bendDegrees(0.01)), pike: round1(bendDegrees(-0.01)) } });
    // 整次都沒一直線（10/20 受測者 B 故意屁股太高）：全部都看
    for (let t = 0; t <= 1000; t += 50) plank.add(m(-0.2), t, false);
    assert.equal(plank.take().features.pike, round1(bendDegrees(0.2)));
    // 算完就清掉，下一次重新量
    assert.deepEqual(plank.take(), { features: { sag: null, pike: null } });
});

test('資料表的欄位：每個動作的特徵；棒式不放撐了幾秒、計次不放第幾下（實測規定的秒數、下數會洩漏答案）', () => {
    const keys = id => featureColumns(id).map(c => c.key);
    assert.deepEqual(keys('squat'), ['min', 'seconds', 'similarity', 'sway', 'stalls', 'lean', 'heel']);
    assert.deepEqual(keys('pushup'), ['min', 'seconds', 'similarity', 'stalls', 'sag', 'pike']);
    assert.deepEqual(keys('lunge'), ['min', 'seconds', 'similarity', 'sway', 'lean', 'knee']);
    assert.deepEqual(keys('plank'), ['holdSway', 'sag', 'pike']);
    for (const id of ['free', 'constructor', '__proto__', 'toString', '']) assert.deepEqual(featureColumns(id), []);
    // 每條規則都有欄位、名字有單位
    for (const id of ['squat', 'pushup', 'lunge', 'plank']) {
        for (const r of FORM_RULES[id]) assert.match(featureColumns(id).find(c => c.key === r.id).name, /（[°%]）$/);
    }
    // 從每一下拿數字：被改壞的（不是數字）當成沒有
    const col = key => featureColumns('squat').find(c => c.key === key);
    assert.equal(col('min').of({ min: 87.6 }), 88);
    assert.equal(col('seconds').of({ start: 1.25, end: 3.31 }), 2.1);
    assert.equal(col('seconds').of({ start: '1', end: 3 }), null);
    assert.equal(col('similarity').of({ similarity: NaN }), null);
    assert.equal(col('stalls').of({ stalls: 1.5 }), null);
    assert.equal(col('lean').of({ features: { lean: 51.2 } }), 51.2);
    assert.equal(col('lean').of({ features: { lean: '51' } }), null);
    assert.equal(col('lean').of({ features: null }), null);
    assert.equal(col('lean').of({}), null);
});

// 特徵和規則量的是同一個數字：規則是超過門檻持續 0.4 秒才報，所以「規則報了這種錯」就是「特徵 > 門檻」
// 合成的組（每一下故意做錯的程度不一樣，有些剛好在門檻附近）每一下每條規則都要對得上；
// 特徵四捨五入到小數第 1 位，剛好在門檻上一點點（差不到 0.05）的會差一點，這些合成的組沒有這種的
test('規則說這一下有錯 ⇔ 這個特徵 > 門檻（合成的四位受測者，共 504 個）', async () => {
    let checked = 0;
    const caught = {};
    for (const subject of ['A', 'B', 'C', 'D']) {
        for (const set of syntheticSubject(subject)) {
            const r = await analyzeOne(set.text);
            // 下數對（棒式每組撐一次）
            assert.equal(r.items.length, r.kind === 'hold' ? 1 : r.info.amount, set.name);
            for (const [i, it] of r.items.entries()) {
                for (const rule of FORM_RULES[r.info.workout]) {
                    const f = it.features[rule.id];
                    const byRule = it.errors.includes(rule.id);
                    assert.equal(f !== null && f > rule.why.limit, byRule, set.name + ' 第 ' + (i + 1) + ' 下 ' + rule.id + '：' + f);
                    if (r.info.condition === rule.id) caught[set.name] = (caught[set.name] || 0) + (byRule ? 1 : 0);
                    checked++;
                }
            }
        }
    }
    assert.equal(checked, 504);
    // 合成的組有抓到也有漏掉（程度 0.5～1.6 倍門檻）：模型才有東西可以學、可以和規則比
    const counts = Object.values(caught);
    assert.ok(counts.some(n => n === 0 || n < 5) && counts.some(n => n > 0), JSON.stringify(caught));
});
