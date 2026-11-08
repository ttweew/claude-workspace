import { syntheticSet } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { ActivityMeter, ActivityDisplay } from '/home/user/claude-workspace/js/analysis/activity.js';
import { AutoSwitch } from '/home/user/claude-workspace/js/analysis/auto-mode.js';
import { WorkoutTracker } from '/home/user/claude-workspace/js/analysis/tracker.js';

// 幾組接在一起（時間接續）
function frames(sets) {
    const out = []; let offset = 0;
    for (const set of sets) {
        const parsed = parseRecording(set.text);
        const t0 = parsed.frames[0].t;
        for (const f of parsed.frames) out.push({ t: offset + f.t - t0, raw: f.raw });
        offset = out[out.length - 1].t + 33;
    }
    return out;
}
function run(sets, start = 'free') {
    const fr = frames(sets);
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = start, tracker = new WorkoutTracker(start);
    const switches = [], counts = {};
    for (const f of fr) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t);
        const shown = display.update(guess);
        const keep = tracker.items.length > 0 || !!(tracker.counter && tracker.counter.current);
        const change = auto.update(p, f.t, guess, shown, current, true, keep);
        if (change) {
            if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
            counts[current] = tracker.items.length;
            switches.push({ at: f.t, to: change.workout, from: change.from, frames: change.frames.length });
            current = change.workout; tracker = new WorkoutTracker(current); meter.reset(); display.reset(); auto.reset();
            for (const g of change.frames) tracker.update(g.processed, g.now);
            switches[switches.length - 1].backfilled = tracker.items.length;
        }
    }
    if (tracker.workout.kind === 'hold' && tracker.counter && tracker.counter.current) tracker.interrupt();
    counts[current] = tracker.items.length;
    return { switches, counts, seconds: fr[fr.length - 1].t / 1000 };
}
// 單一動作：全部格子給同一個動作算的次數
function full(set, id) {
    const parsed = parseRecording(set.text); const pipeline = new PosePipeline(), tracker = new WorkoutTracker(id);
    for (const f of parsed.frames) tracker.update(pipeline.process(f.raw, f.t, 640, 480), f.t);
    return tracker.items.length;
}
for (const [s, w] of [['K', 'squat'], ['K', 'pushup'], ['K', 'lunge'], ['K', 'plank'], ['I', 'squat'], ['J', 'lunge']]) {
    const set = syntheticSet(s, w, 'good', 1);
    console.log(s, w, 'full', full(set, w), JSON.stringify(run([set])));
}
console.log('squat→pushup', JSON.stringify(run([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)])));
console.log('squat→lunge', JSON.stringify(run([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'lunge', 'good', 1)])));
console.log('lunge→squat', JSON.stringify(run([syntheticSet('K', 'lunge', 'good', 1), syntheticSet('K', 'squat', 'good', 1)])));
