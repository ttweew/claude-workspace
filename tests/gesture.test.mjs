// 手勢控制（11/8）：站著舉起一隻手過頭 2 秒才觸發（js/analysis/gesture.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { raisedHand, RaiseHand, HOLD_MS } from '../js/analysis/gesture.js';
import { demoLandmarks } from './helpers.mjs';
import { P } from '../js/skeleton/landmarks.js';

// 示範動畫的姿勢（640×480）；hands：'left'、'right'、'both' 舉過頭（手腕在鼻子上面約 0.15 畫面高）
function pose(id = 'squat', depth = 0, hands = null) {
    const lm = demoLandmarks(id, depth).map(p => ({ ...p }));
    const raise = side => {
        const s = lm[P[side + '_SHOULDER']], nose = lm[P.NOSE];
        lm[P[side + '_ELBOW']] = { ...lm[P[side + '_ELBOW']], x: s.x, y: (s.y + nose.y) / 2 - 0.05 };
        lm[P[side + '_WRIST']] = { ...lm[P[side + '_WRIST']], x: s.x, y: nose.y - 0.15 };
    };
    if (hands === 'left' || hands === 'both') raise('LEFT');
    if (hands === 'right' || hands === 'both') raise('RIGHT');
    return { landmarks: lm, width: 640, height: 480 };
}

test('這一格是不是站著舉一隻手過頭：兩手都舉、手在胸前、趴著都不算；看不到臉、肩膀、被改壞的不算', () => {
    assert.equal(raisedHand(pose('squat', 0, 'right')), 'right');
    assert.equal(raisedHand(pose('squat', 0, 'left')), 'left');
    assert.equal(raisedHand(pose('lunge', 0, 'right')), 'right', '弓箭步站著也可以');
    assert.equal(raisedHand(pose('squat', 0, 'both')), null, '兩手一起往上伸懶腰：不算');
    assert.equal(raisedHand(pose('squat', 0)), null, '手放著');
    for (const d of [0.3, 0.6, 1]) assert.equal(raisedHand(pose('squat', d)), null, '深蹲蹲下去（手往前伸）' + d);
    for (const id of ['pushup', 'plank']) assert.equal(raisedHand(pose(id, 0, 'right')), null, id + '：趴著不算');
    // 另一隻手看不到（側面拍常被身體擋住）：當成放著
    const hidden = pose('squat', 0, 'right');
    hidden.landmarks[P.LEFT_WRIST] = { ...hidden.landmarks[P.LEFT_WRIST], visibility: 0.1 };
    assert.equal(raisedHand(hidden), 'right');
    // 臉看不到：不算（看不出手有沒有過頭）
    const noFace = pose('squat', 0, 'right');
    noFace.landmarks[P.NOSE] = { ...noFace.landmarks[P.NOSE], visibility: 0.1 };
    assert.equal(raisedHand(noFace), null);
    // 擋鬼點標成看不到的點（visible: false）也不算
    const ghost = pose('squat', 0, 'right');
    ghost.landmarks[P.RIGHT_WRIST] = { ...ghost.landmarks[P.RIGHT_WRIST], visible: false };
    assert.equal(raisedHand(ghost), null);
    for (const bad of [null, {}, { landmarks: 'x' }, { landmarks: [] }, { landmarks: Array(33).fill(null) }, { landmarks: Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.99 }) }]) {
        assert.equal(raisedHand(bad), null, JSON.stringify(bad).slice(0, 40));
    }
});

// 每 1000/30 毫秒一格，餵 frames（[p, 幾格]）；回傳每一格的結果
function feed(g, parts, t0 = 0) {
    const out = [];
    let t = t0;
    for (const [p, n] of parts) {
        for (let i = 0; i < n; i++) {
            out.push({ t, ...g.update(p, t) });
            t += 1000 / 30;
        }
    }
    return out;
}

test('舉滿 2 秒觸發一次；一直舉著不會再觸發，放下再舉才會；中間放下重來；AI 漏掉一兩格不算放下', () => {
    const up = pose('squat', 0, 'right'), down = pose('squat', 0);
    // 舉 3 秒：剛好 2 秒那一格觸發一次
    let g = new RaiseHand();
    let r = feed(g, [[down, 10], [up, 90]]);
    const fired = r.filter(x => x.fired);
    assert.equal(fired.length, 1);
    assert.ok(Math.abs(fired[0].t - r[10].t - HOLD_MS) < 40, '舉了 ' + (fired[0].t - r[10].t) + ' 毫秒才觸發');
    assert.ok(r.slice(10).every(x => x.fired || x.holding <= HOLD_MS));
    // 放下再舉：再觸發一次
    r = feed(g, [[down, 5], [up, 70]], r[r.length - 1].t + 1000 / 30);
    assert.equal(r.filter(x => x.fired).length, 1);
    // 舉 1.5 秒放下、再舉 1.5 秒：都不到 2 秒，不觸發
    g = new RaiseHand();
    r = feed(g, [[up, 45], [down, 3], [up, 45]]);
    assert.equal(r.filter(x => x.fired).length, 0);
    assert.ok(r[47].holding === 0, '放下就重來');
    // 舉著的時候 AI 漏掉 2 格（沒有人）：時間接著算，照樣在 2 秒觸發
    g = new RaiseHand();
    r = feed(g, [[up, 30], [null, 2], [up, 40]]);
    const once = r.filter(x => x.fired);
    assert.equal(once.length, 1);
    assert.ok(Math.abs(once[0].t - HOLD_MS) < 40, '漏掉的兩格也算舉著：' + once[0].t);
    assert.ok(r[30].holding > 900, '漏掉的那格不歸零：' + r[30].holding);
    // 人走掉 1 秒：重來
    g = new RaiseHand();
    r = feed(g, [[up, 40], [null, 30], [up, 40]]);
    assert.equal(r.filter(x => x.fired).length, 0);
    // 時間倒退（兩份錄製檔接在一起）：重新開始；時間被改壞不算
    g = new RaiseHand();
    feed(g, [[up, 50]], 5000);
    assert.equal(g.update(up, 0).holding, 0);
    assert.deepEqual(new RaiseHand().update(up, NaN), { holding: 0, fired: false });
});
