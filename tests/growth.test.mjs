// 成長曲線（js/analysis/growth.js）、雲端讀回來的紀錄（js/cloud/sync.js 的 fromCloud），11/1
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, growthSeries, growthWorkouts, growthLine, dayKey, METRICS, GROWTH } from '../js/analysis/growth.js';
import { fromCloud, cloudSession, sessionId } from '../js/cloud/sync.js';
import { summarize, compare } from '../js/analysis/session.js';

// 某一天幾點（這台電腦的時區；一天一個點也照這台電腦的時區分，所以測試不受時區影響）
const at = (month, day, hour = 20, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
// 一組深蹲：每一下 [最低角度, 錯誤]
function squat(date, list, sim = 90) {
    const items = list.map(([min, errors = []], i) => ({ n: i + 1, min, depth: min <= 90 ? 'good' : min <= 110 ? 'close' : 'shallow', start: i * 3, end: i * 3 + 2, errors, similarity: sim }));
    return summarize('squat', items, date, date + 60000);
}
const plank = (date, seconds) => summarize('plank', seconds.map(s => ({ seconds: s, errors: [] })), date, date + 60000);

test('一天一個點：一次最多幾下取最好的那組；比例把那天的下數加起來算；相似度照下數加權', () => {
    const records = [
        squat(at(10, 20), [[85], [85], [100], [120]]),                   // 4 下，到位 2
        squat(at(10, 20, 21), [[85], [85], [85], [85], [85], [85]], 80), // 6 下，到位 6，相似 80
        squat(at(10, 22), [[85], [85, ['lean']], [85]]),                 // 3 下
        plank(at(10, 21), [32.6, 20])
    ];
    const count = growthSeries(records, 'squat', 'count');
    assert.deepEqual(count.days.map(d => [d.label, d.value, d.sessions]), [['10/20', 6, 2], ['10/22', 3, 1]]);
    // 10/20：到位 8／10 下 = 80%；相似度 (90×4 + 80×6) ÷ 10 = 84
    assert.deepEqual(growthSeries(records, 'squat', 'good').days.map(d => d.value), [80, 100]);
    assert.deepEqual(growthSeries(records, 'squat', 'similarity').days.map(d => d.value), [84, 90]);
    assert.deepEqual(growthSeries(records, 'squat', 'clean').days.map(d => d.value), [100, 67]);
    // 棒式：秒數和總結一樣無條件捨去（32.6 → 32）
    const hold = growthSeries(records, 'plank', 'best');
    assert.deepEqual(hold.days.map(d => d.value), [32]);
    assert.equal(growthSeries(records, 'plank', 'total').days[0].value, 52);
    assert.deepEqual(growthWorkouts(records), ['squat', 'plank']);
});

test('同一個數字：只做一組的那天，到位比例、沒有錯誤的比例和那一組總結寫的一樣', () => {
    const one = squat(at(10, 25), [[85], [100], [120], [85], [85], [85, ['lean']]]);
    const prev = squat(at(10, 24), [[85]]);
    const line = compare(one, prev).find(l => l.startsWith('到位比例'));
    assert.match(line, /^到位比例 67%/);
    assert.equal(growthSeries([one], 'squat', 'good').days[0].value, 67);
    assert.equal(growthSeries([one], 'squat', 'clean').days[0].value, Math.round(5 / 6 * 100));
});

test('這台裝置＋雲端：同一筆只算一次（用這台裝置的）；只在雲端的也畫進來', () => {
    const a = squat(at(10, 20), [[85], [85]]), b = squat(at(10, 21), [[85]]), c = squat(at(9, 30), [[85], [85], [85]]);
    const cloudCopyOfA = { ...fromCloud(cloudSession(a)) };
    const { records, cloudOnly } = mergeRecords([a, b], [cloudCopyOfA, fromCloud(cloudSession(c))]);
    assert.equal(cloudOnly, 1);
    assert.deepEqual(records.map(s => sessionId(s)), [c, a, b].map(sessionId));
    assert.equal(records[1], a, '同一筆用這台裝置上的');
    assert.deepEqual(growthSeries(records, 'squat', 'count').days.map(d => d.label), ['9/30', '10/20', '10/21']);
});

test('最多畫最近 30 天，更早的寫出幾天；只有一天時說再做一天', () => {
    const many = Array.from({ length: 35 }, (_, i) => squat(at(9, 1) + i * 86400000, [[85], [85]]));
    const g = growthSeries(many, 'squat', 'count');
    assert.equal(g.days.length, GROWTH.MAX_DAYS);
    assert.equal(g.earlier, 5);
    assert.equal(g.first.day, dayKey(many[5].date));
    const one = growthSeries([many[0]], 'squat', 'count');
    assert.match(growthLine(one), /^深蹲 一次最多幾下：只有 9\/1 一天（2 下），再做一天就畫得出曲線$/);
    const two = growthSeries([squat(at(10, 20), [[85]]), squat(at(11, 1), [[85], [85], [85]])], 'squat', 'count');
    assert.equal(growthLine(two), '深蹲 一次最多幾下：10/20 1 下 → 11/1 3 下（2 天），最多是 11/1 的 3 下');
    assert.equal(growthLine(growthSeries([plank(at(10, 21), [32.6]), plank(at(10, 22), [20])], 'plank', 'best')), '棒式 最久撐幾秒：10/21 32 秒 → 10/22 20 秒（2 天），最久是 10/21 的 32 秒');
});

test('外面來的動作、數字名稱先比對清單（constructor 這種查得到東西的名字不能用）；沒有相似度的天不畫', () => {
    const records = [squat(at(10, 20), [[85]], null)];
    assert.equal(growthSeries(records, 'constructor', 'count'), null);
    assert.equal(growthSeries(records, 'squat', 'constructor'), null);
    assert.equal(growthSeries(records, 'squat', 'best'), null, '棒式的數字不給深蹲用');
    assert.equal(growthSeries(records, 'free', 'count'), null);
    assert.equal(growthSeries(records, 'squat', 'similarity'), null);
    assert.equal(growthSeries(records, 'pushup', 'count'), null);
    assert.deepEqual(Object.keys(METRICS), ['reps', 'hold']);
});

test('雲端讀回來的：和上傳的同一套檢查，多的欄位不要、被改過的不用', () => {
    const s = squat(at(10, 20), [[85], [100, ['lean']]]);
    const up = { ...cloudSession(s), savedAt: { seconds: 1 } };
    const back = fromCloud(up);
    assert.deepEqual(Object.keys(back).sort(), ['average', 'best', 'clean', 'close', 'count', 'date', 'errors', 'good', 'minutes', 'shallow', 'similarity', 'tempo', 'workout'].sort());
    assert.deepEqual(back.errors, { lean: 1 });
    // 讀回來的和這台裝置上的總結數字一樣（同一筆畫出來一樣）
    for (const k of ['count', 'clean', 'good', 'close', 'shallow', 'best', 'average', 'tempo', 'similarity']) assert.equal(back[k], s[k], k);
    for (const bad of [null, [], 'x', { ...up, count: -1 }, { ...up, workout: 'constructor' }, { ...up, good: 9 }, { ...up, date: 'x' }, { ...up, errors: [] }, { ...up, best: 200 }]) {
        assert.equal(fromCloud(bad), null, JSON.stringify(bad));
    }
    // 不認得的錯誤代號拿掉，其他照用（和上傳一樣）
    assert.deepEqual(fromCloud({ ...up, errors: { lean: 1, constructor: 1 } }).errors, { lean: 1 });
    const p = plank(at(10, 21), [32.6, 20]);
    assert.deepEqual(fromCloud(cloudSession(p)).seconds, [32, 20]);
});
