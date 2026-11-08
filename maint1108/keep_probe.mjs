// main.js 的 AI 全自動沒有傳 keep（原本的動作已經數到東西）：重算會不會把上一個動作的骨架算進新的動作？
// 照 tests/auto-mode.test.mjs 的 run()，keep 照 main.js（不傳）和照設計（傳）各跑一次
const R = process.argv[2];
const { AutoSwitch } = await import(R + '/js/analysis/auto-mode.js');
const { ActivityMeter, ActivityDisplay } = await import(R + '/js/analysis/activity.js');
const { WorkoutTracker } = await import(R + '/js/analysis/tracker.js');
const { PosePipeline } = await import(R + '/js/skeleton/pipeline.js');
const { parseRecording } = await import(R + '/js/data/replay-core.js');
const { syntheticSet } = await import(R + '/tests/synthetic-sets.mjs');
const { script, rep } = await import(R + '/tests/browser/harness.mjs');
function framesOf(sets) {
    const out = []; let offset = 0;
    for (const set of sets) {
        const parsed = parseRecording(set.text); const t0 = parsed.frames[0].t;
        for (const f of parsed.frames) out.push({ t: offset + f.t - t0, raw: f.raw });
        offset = out[out.length - 1].t + 33;
    }
    return out;
}
const demo = parts => script(parts).map((f, i) => ({ t: Math.round(i * 1000 / 30), raw: f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) }));
function run(frames, passKeep) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const counts = [], sw = [];
    const finish = () => { if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt(); counts.push([current, tracker.items.length]); };
    for (const f of frames) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t), shown = display.update(guess);
        const keep = tracker.items.length > 0 || !!(tracker.counter && tracker.counter.current);
        const change = passKeep ? auto.update(p, f.t, guess, shown, current, true, keep) : auto.update(p, f.t, guess, shown, current, true);
        if (!change) continue;
        finish(); current = change.workout; tracker = new WorkoutTracker(current);
        meter.reset(); display.reset(); auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
        sw.push(change.workout + '@' + (f.t / 1000).toFixed(1) + 's(from ' + (change.from / 1000).toFixed(1) + ', backfill ' + tracker.items.length + ')');
    }
    finish();
    return counts.filter(([id]) => id !== 'free').map(([id, n]) => id + ' ' + n).join(' → ') + '   ｜ ' + sw.join(' ');
}
const reps = (id, n) => Array.from({ length: n }, () => rep(id, { hold: 10, rest: 20 })).flat();
const st = (id, frames) => ({ id, depth: 0, frames });
const cases = {
    '示範：伏地挺身 8 → 弓箭步 8（11/8 效能測試那一段）': demo([st('pushup', 120), ...reps('pushup', 8), st('pushup', 30), ...reps('lunge', 8), st('lunge', 60)]),
    '示範：弓箭步 6 → 馬上深蹲 6': demo([st('lunge', 120), ...reps('lunge', 6), ...reps('squat', 6), st('squat', 60)]),
    '示範：深蹲 6 → 馬上弓箭步 6': demo([st('squat', 120), ...reps('squat', 6), ...reps('lunge', 6), st('lunge', 60)]),
    '示範：弓箭步 6 → 站 2 秒 → 深蹲 6': demo([st('lunge', 120), ...reps('lunge', 6), st('lunge', 60), ...reps('squat', 6), st('squat', 60)]),
    'K：弓箭步 → 深蹲': framesOf([syntheticSet('K', 'lunge', 'good', 1), syntheticSet('K', 'squat', 'good', 1)]),
    'K：深蹲 → 弓箭步': framesOf([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'lunge', 'good', 1)]),
    'K：伏地挺身 → 弓箭步': framesOf([syntheticSet('K', 'pushup', 'good', 1), syntheticSet('K', 'lunge', 'good', 1)]),
    'K：深蹲 → 伏地挺身 → 弓箭步': framesOf([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1), syntheticSet('K', 'lunge', 'good', 1)]),
};
for (const [name, frames] of Object.entries(cases)) {
    console.log(name);
    console.log('   main.js（不傳 keep）：', run(frames, false));
    console.log('   照設計（傳 keep）   ：', run(frames, true));
}
