const R = '/home/user/claude-workspace';
const { AutoSwitch, dropRecounted } = await import(R + '/js/analysis/auto-mode.js');
const { ActivityMeter, ActivityDisplay } = await import(R + '/js/analysis/activity.js');
const { WorkoutTracker } = await import(R + '/js/analysis/tracker.js');
const { PosePipeline } = await import(R + '/js/skeleton/pipeline.js');
const { demoLandmarks } = await import(R + '/tests/helpers.mjs');
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
function run(frames, drop) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const counts = [];
    for (const f of frames) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t), shown = display.update(guess);
        const change = auto.update(p, f.t, shown, current, true);
        if (!change) continue;
        if (drop) dropRecounted(tracker, change);
        counts.push([current, tracker.items.length]);
        current = change.workout; tracker = new WorkoutTracker(current);
        meter.reset(); display.reset(); auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
    }
    counts.push([current, tracker.items.length]);
    return counts.filter(([id, n]) => id !== 'free' && n).map(x => x.join(' ')).join(' → ');
}
for (const [a, b] of [['squat', 'lunge'], ['lunge', 'squat'], ['squat', 'pushup'], ['pushup', 'squat'], ['lunge', 'pushup'], ['pushup', 'lunge']])
    for (const pause of [0, 1, 15, 30, 45, 60, 90, 120, 180]) {
        const frames = demoFrames([[a, 0, 120], [a, 6, pause], [b, 6, 60]]);
        console.log(`${a} → ${b} 停 ${pause} 格`.padEnd(26), '以前：', run(frames, false).padEnd(22), '｜ 改了：', run(frames, true));
    }
