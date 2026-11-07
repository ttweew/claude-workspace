// AI 全自動（11/9）：不用選動作，AI 認出你在做什麼就自動換過去開始計次（js/analysis/auto-mode.js）
// 用合成受測者的組（tests/synthetic-sets.mjs）照 main.js 的做法跑一次：每一格 pipeline → AI 自動辨識動作 → 要不要換 →
// 換過去時把最近幾秒的骨架交給新的動作重算
import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoSwitch, AUTO_HOLD_MS, SWITCH_HOLD_MS, BACKFILL_MS } from '../js/analysis/auto-mode.js';
import { ActivityMeter, ActivityDisplay } from '../js/analysis/activity.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { parseRecording } from '../js/data/replay-core.js';
import { syntheticSet } from './synthetic-sets.mjs';

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
// 和 main.js 一樣：每一格先給現在的動作算，再看要不要換；換的時候棒式撐到現在的算一次（finishSession），
// 新的動作重算最近幾秒；canSwitch(t)：這一格可不可以換（錄製中不行）
function run(sets, { canSwitch = () => true } = {}) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const switches = [], counts = [];
    const finish = () => {
        if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
        counts.push([current, tracker.items.length]);
    };
    for (const f of framesOf(sets)) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t);
        const shown = display.update(guess);
        const keep = tracker.items.length > 0 || !!(tracker.counter && tracker.counter.current);
        const change = auto.update(p, f.t, guess, shown, current, canSwitch(f.t), keep);
        if (!change) continue;
        finish();
        current = change.workout;
        tracker = new WorkoutTracker(current);
        meter.reset();
        display.reset();
        auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
        switches.push({ at: f.t, to: change.workout, from: change.from, backfilled: tracker.items.length });
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
        const r = run([set]);
        assert.equal(r.switches[0].to, id, subject + ' ' + id);
        // 大約 5 秒認出來；那時已經做了一下，是重算出來的
        assert.ok(r.switches[0].at < 7000, subject + ' ' + id + ' ' + r.switches[0].at);
        assert.equal(r.switches[0].backfilled, 1, subject + ' ' + id);
        assert.deepEqual(r.counts, [[id, full(set, id)]], subject + ' ' + id);
        assert.equal(full(set, id), 10);
    }
});

test('換動作：深蹲 10 下 → 伏地挺身 10 下，兩個都數到；重算不會把深蹲算進伏地挺身', () => {
    const r = run([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)]);
    assert.deepEqual(r.switches.map(s => s.to), ['squat', 'pushup']);
    assert.deepEqual(r.counts, [['squat', 10], ['pushup', 10]]);
    // 換到伏地挺身時深蹲已經數到東西：重算從最後一次猜成深蹲之後開始（深蹲那組 37 秒）
    assert.ok(r.switches[1].from > 36000, String(r.switches[1].from));
});

test('錄製中不換：可以換之後才換過去，之前做的照樣重算（最多 8 秒）', () => {
    const set = syntheticSet('K', 'squat', 'good', 1);
    const free = run([set]);
    const locked = run([set], { canSwitch: t => t >= 9000 });
    assert.ok(locked.switches[0].at >= 9000 && locked.switches[0].at < 9100, String(locked.switches[0].at));
    assert.equal(locked.switches[0].to, 'squat');
    // 晚換了約 3.4 秒，重算的骨架還是從深蹲開始前（最多往回 8 秒）
    assert.ok(locked.switches[0].backfilled >= free.switches[0].backfilled);
    assert.deepEqual(locked.counts, free.counts);
});

// 直接餵「畫面上 AI 猜的」：每 0.5 秒一次
function feed(auto, list, current = 'free', keep = false) {
    let out = null;
    for (const [t, label, extra = {}] of list) {
        const shown = label === undefined ? null : { label, confidence: 0.9 };
        const r = auto.update({ t }, t, label === undefined ? null : { label }, shown, extra.current || current, extra.canSwitch !== false, extra.keep !== undefined ? extra.keep : keep);
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
    // 在數深蹲時猜成弓箭步：3 秒才換；深蹲數到東西了 → 從最後一次猜成深蹲之後開始重算
    const c = feed(new AutoSwitch(), [...every(0, 9000, 'squat'), ...every(9500, 14000, 'lunge')], 'squat', true);
    assert.equal(c.at, 9500 + SWITCH_HOLD_MS);
    assert.equal(c.from, 9000);
    // 深蹲什麼都沒數到（剛開始被猜錯）：不管它，從 3.5 秒前開始
    const d = feed(new AutoSwitch(), [...every(0, 9000, 'squat'), ...every(9500, 14000, 'lunge')], 'squat', false);
    assert.equal(d.from, 9500 - 3500);
    // 中間猜回原本的動作就重新等
    const e = feed(new AutoSwitch(), [...every(0, 2000, 'lunge'), [2500, 'squat'], ...every(3000, 6000, 'lunge')], 'squat', true);
    assert.equal(e.at, 3000 + SWITCH_HOLD_MS);
    // 錄製中不換，可以換的那一格馬上換
    const f = feed(new AutoSwitch(), [...every(0, 8000, 'squat', { canSwitch: false }), [8500, 'squat']]);
    assert.equal(f.at, 8500);
    // 只留最近 8 秒
    const g = new AutoSwitch();
    feed(g, every(0, 20000, 'stand'));
    assert.ok(g.frames.length <= BACKFILL_MS / 500 + 1 && g.frames[0].now >= 20000 - BACKFILL_MS);
});
