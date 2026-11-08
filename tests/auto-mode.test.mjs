// AI 全自動（11/9）：不用選動作，AI 認出你在做什麼就自動換過去開始計次（js/analysis/auto-mode.js）
// 用合成受測者的組（tests/synthetic-sets.mjs）、示範動畫的火柴人照 main.js 的做法跑一次：每一格 pipeline → AI 自動辨識動作 → 要不要換 →
// 換過去時原本的動作拿掉新的動作會重算的那幾下，把最近幾秒的骨架交給新的動作重算
import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoSwitch, AUTO_HOLD_MS, SWITCH_HOLD_MS, BACKFILL_MS, dropRecounted } from '../js/analysis/auto-mode.js';
import { ActivityMeter, ActivityDisplay } from '../js/analysis/activity.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { parseRecording } from '../js/data/replay-core.js';
import { syntheticSet } from './synthetic-sets.mjs';
import { demoLandmarks } from './helpers.mjs';

// 幾組接在一起（時間接著上一組）
function framesOf(sets) {
    const out = [];
    let offset = 0;
    for (const set of sets) {
        const parsed = parseRecording(set.text);
        const t0 = parsed.frames[0].t;
        for (const f of parsed.frames) out.push({ t: offset + f.t - t0, raw: f.raw });
        offset = out[out.length - 1].t + 33;
    }
    return out;
}
// 示範動畫的火柴人（和 tests/browser/harness.mjs 的 script、rep 一樣排）：每秒 30 格；
// parts 每一段 [動作, 幾下]（一下：下去 1 秒、底部停 10 格、起來 1 秒、站 20 格）或 [動作, 0, 站幾格]
function demoFrames(parts) {
    const out = [];
    const add = (id, depth) => out.push({ t: Math.round(out.length * 1000 / 30), raw: demoLandmarks(id, depth) });
    for (const [id, reps, stand = 0] of parts) {
        for (let r = 0; r < reps; r++) {
            for (let i = 0; i <= 30; i++) add(id, i / 30);
            for (let i = 0; i < 10; i++) add(id, 1);
            for (let i = 0; i <= 30; i++) add(id, 1 - i / 30);
            for (let i = 0; i < 20; i++) add(id, 0);
        }
        for (let i = 0; i < stand; i++) add(id, 0);
    }
    return out;
}
// 和 main.js 一樣：每一格先給現在的動作算，再看要不要換；換的時候原本的動作拿掉新的動作會重算的那幾下（dropRecounted）、
// 棒式撐到現在的算一次（finishSession），新的動作重算最近幾秒；canSwitch(t)：這一格可不可以換（錄製中不行）
// frames：framesOf（合成受測者）或 demoFrames（示範動畫）
function run(frames, { canSwitch = () => true } = {}) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const switches = [], counts = [];
    const finish = () => {
        if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
        counts.push([current, tracker.items.length]);
    };
    for (const f of frames) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t);
        const shown = display.update(guess);
        const change = auto.update(p, f.t, shown, current, canSwitch(f.t));
        if (!change) continue;
        const dropped = dropRecounted(tracker, change);
        finish();
        current = change.workout;
        tracker = new WorkoutTracker(current);
        meter.reset();
        display.reset();
        auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
        switches.push({ at: f.t, to: change.workout, from: change.from, backfilled: tracker.items.length, dropped });
    }
    finish();
    return { switches, counts: counts.filter(([id]) => id !== 'free') };
}
// 一開始就選對動作，全部的格子都給它算：幾下
function full(set, id) {
    const parsed = parseRecording(set.text);
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker(id);
    for (const f of parsed.frames) tracker.update(pipeline.process(f.raw, f.t, 640, 480), f.t);
    return tracker.items.length;
}

test('自由模式開始（合成受測者 K、I、J）：認出深蹲、伏地挺身、弓箭步就換過去，每一下都數到（和一開始就選對的一樣多）', () => {
    for (const [subject, id] of [['K', 'squat'], ['K', 'pushup'], ['K', 'lunge'], ['I', 'squat'], ['J', 'lunge']]) {
        const set = syntheticSet(subject, id, 'good', 1);
        const r = run(framesOf([set]));
        assert.equal(r.switches[0].to, id, subject + ' ' + id);
        // 大約 5 秒認出來；那時已經做了一下，是重算出來的
        assert.ok(r.switches[0].at < 7000, subject + ' ' + id + ' ' + r.switches[0].at);
        assert.equal(r.switches[0].backfilled, 1, subject + ' ' + id);
        assert.deepEqual(r.counts, [[id, full(set, id)]], subject + ' ' + id);
        assert.equal(full(set, id), 10);
    }
});

test('換動作：深蹲 10 下 → 伏地挺身 10 下，兩個都數到；重算不會把深蹲算進伏地挺身', () => {
    const r = run(framesOf([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)]));
    assert.deepEqual(r.switches.map(s => s.to), ['squat', 'pushup']);
    assert.deepEqual(r.counts, [['squat', 10], ['pushup', 10]]);
    // 重算從 AI 認出伏地挺身之前 3.5 秒開始，深蹲那組（37 秒）已經做完：深蹲一下都沒拿掉
    assert.ok(r.switches[1].from > 36000, String(r.switches[1].from));
    assert.equal(r.switches[1].dropped, 0);
});

test('換動作的那幾秒同一下不能兩個動作都算（11/8 保養）：示範動畫深蹲、弓箭步互換，中間停 0～2 秒', () => {
    // AI 還沒認出換了動作的那幾秒，原本的動作照樣在數（都是彎膝蓋），新的動作又重算：以前前一個動作多 2 下（深蹲 6 下算成 8 下）
    // 弓箭步換深蹲時，深蹲的第 1 下常漏算（改之前就這樣）：AI 要看滿 3 秒深蹲才認得出來，重算的第一格在第 1 下開始之後一點點
    for (const [a, b, least] of [['squat', 'lunge', 6], ['lunge', 'squat', 5]]) for (const pause of [0, 30, 60]) {
        const what = a + ' → ' + b + '，停 ' + pause + ' 格';
        const r = run(demoFrames([[a, 0, 120], [a, 6, pause], [b, 6, 60]]));
        assert.deepEqual(r.counts.map(c => c[0]), [a, b], what);
        assert.equal(r.counts[0][1], 6, what);
        assert.ok(r.counts[1][1] >= least && r.counts[1][1] <= 6, what + '：' + r.counts[1][1]);
        assert.equal(r.switches[1].dropped, 2, what);
    }
});

test('dropRecounted：新的動作重算時數到東西，才拿掉原本的動作在重算的第一格之後才開始的那幾下；AI 認錯（新的動作數不到）、棒式、沒有格子都不拿', () => {
    // 深蹲 3 下接弓箭步 2 下，全部給深蹲算：弓箭步也被數成深蹲（5 下）
    const pipeline = new PosePipeline();
    const frames = demoFrames([['squat', 0, 60], ['squat', 3], ['lunge', 2, 30]]).map(f => ({ processed: pipeline.process(f.raw, f.t, 640, 480), now: f.t }));
    const lungeAt = (60 + 3 * 92) * 1000 / 30;   // 弓箭步的第一格（站 60 格、深蹲每下 92 格）
    const tail = frames.filter(f => f.now >= lungeAt - 200);
    const squatOf = () => {
        const t = new WorkoutTracker('squat');
        for (const f of frames) t.update(f.processed, f.now);
        return t;
    };
    const a = squatOf();
    assert.equal(a.items.length, 5);
    assert.equal(dropRecounted(a, { workout: 'lunge', frames: tail }), 2);
    assert.equal(a.items.length, 3);
    // AI 認錯成伏地挺身：伏地挺身數不到（站著），深蹲數到的都留著
    const b = squatOf();
    assert.equal(dropRecounted(b, { workout: 'pushup', frames: tail }), 0);
    assert.equal(b.items.length, 5);
    // 換成棒式、沒有格子：不拿
    assert.equal(dropRecounted(squatOf(), { workout: 'plank', frames: tail }), 0);
    assert.equal(dropRecounted(squatOf(), { workout: 'lunge', frames: [] }), 0);
    // 原本是棒式（一次是撐著的一段時間）：不拿
    const plank = new WorkoutTracker('plank');
    plank.counter.holds.push({ n: 1, start: 5, end: 9, seconds: 4 });
    assert.equal(dropRecounted(plank, { workout: 'lunge', frames: tail }), 0);
    assert.equal(plank.items.length, 1);
});

test('錄製中不換：可以換之後才換過去，之前做的照樣重算（最多 8 秒）', () => {
    const set = syntheticSet('K', 'squat', 'good', 1);
    const free = run(framesOf([set]));
    const locked = run(framesOf([set]), { canSwitch: t => t >= 9000 });
    assert.ok(locked.switches[0].at >= 9000 && locked.switches[0].at < 9100, String(locked.switches[0].at));
    assert.equal(locked.switches[0].to, 'squat');
    // 晚換了約 3.4 秒，重算的骨架還是從深蹲開始前（最多往回 8 秒）
    assert.ok(locked.switches[0].backfilled >= free.switches[0].backfilled);
    assert.deepEqual(locked.counts, free.counts);
});

// 直接餵「畫面上 AI 猜的」：每 0.5 秒一次
function feed(auto, list, current = 'free') {
    let out = null;
    for (const [t, label, extra = {}] of list) {
        const shown = label === undefined ? null : { label, confidence: 0.9 };
        const r = auto.update({ t }, t, shown, extra.current || current, extra.canSwitch !== false);
        if (r) out = { ...r, at: t };
    }
    return out;
}
const every = (from, to, label, extra) => Array.from({ length: Math.floor((to - from) / 500) + 1 }, (_, i) => [from + i * 500, label, extra]);

test('什麼時候換：站著、還不確定、同一個動作都不換；自由模式穩定 1.5 秒、在數別的動作要 3 秒；從哪一格開始重算', () => {
    assert.equal(feed(new AutoSwitch(), every(0, 20000, 'stand')), null);
    assert.equal(feed(new AutoSwitch(), every(0, 20000, null)), null);
    assert.equal(feed(new AutoSwitch(), every(0, 20000, undefined)), null);
    assert.equal(feed(new AutoSwitch(), every(0, 20000, 'squat'), 'squat'), null);
    for (const bad of ['free', 'constructor', '__proto__']) assert.equal(feed(new AutoSwitch(), every(0, 20000, bad)), null, bad);
    // 自由模式：3 秒開始猜深蹲，1.5 秒後換；從 3.5 秒前開始重算（AI 看的是前 3 秒）
    const a = new AutoSwitch();
    const r = feed(a, [...every(0, 2500, 'stand'), ...every(3000, 4500, 'squat')]);
    assert.equal(r.at, 3000 + AUTO_HOLD_MS);
    assert.equal(r.workout, 'squat');
    assert.equal(r.from, 3000 - 3500);
    assert.deepEqual(r.frames.map(f => f.now), every(0, 4500).map(([t]) => t));
    assert.equal(a.pending, null);
    // 等的時候 pending 是哪一個
    const b = new AutoSwitch();
    feed(b, every(0, 1000, 'lunge'), 'free');
    assert.equal(b.pending, 'lunge');
    // 在數深蹲時猜成弓箭步：3 秒才換；一樣從 3.5 秒前開始重算（深蹲在這之後才開始的那幾下由 dropRecounted 拿掉）
    const c = feed(new AutoSwitch(), [...every(0, 9000, 'squat'), ...every(9500, 14000, 'lunge')], 'squat');
    assert.equal(c.at, 9500 + SWITCH_HOLD_MS);
    assert.equal(c.from, 9500 - 3500);
    // 中間猜回原本的動作就重新等
    const e = feed(new AutoSwitch(), [...every(0, 2000, 'lunge'), [2500, 'squat'], ...every(3000, 6000, 'lunge')], 'squat');
    assert.equal(e.at, 3000 + SWITCH_HOLD_MS);
    // 錄製中不換，可以換的那一格馬上換
    const f = feed(new AutoSwitch(), [...every(0, 8000, 'squat', { canSwitch: false }), [8500, 'squat']]);
    assert.equal(f.at, 8500);
    // 只留最近 8 秒
    const g = new AutoSwitch();
    feed(g, every(0, 20000, 'stand'));
    assert.ok(g.frames.length <= BACKFILL_MS / 500 + 1 && g.frames[0].now >= 20000 - BACKFILL_MS);
});
