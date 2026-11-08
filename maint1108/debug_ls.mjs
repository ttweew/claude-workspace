const R = '/home/user/claude-workspace';
const { AutoSwitch, dropRecounted } = await import(R + '/js/analysis/auto-mode.js');
const { ActivityMeter, ActivityDisplay } = await import(R + '/js/analysis/activity.js');
const { WorkoutTracker } = await import(R + '/js/analysis/tracker.js');
const { PosePipeline } = await import(R + '/js/skeleton/pipeline.js');
const { demoLandmarks } = await import(R + '/tests/helpers.mjs');
function demoFrames(parts) {
    const out = [];
    const add = (id, depth) => out.push({ t: Math.round(out.length * 1000 / 30), raw: demoLandmarks(id, depth), id, depth });
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
for (const extra of [0, 1]) {
    const frames = demoFrames([['lunge', 0, 120], ['lunge', 6, 0], ['squat', 0, extra], ['squat', 6, 60]]);
    const firstSquat = frames.find(f => f.id === 'squat').t;
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const log = [];
    let lastShown = null;
    for (const f of frames) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t), shown = display.update(guess);
        const lab = shown ? shown.label : null;
        if (lab !== lastShown) { log.push(`${(f.t / 1000).toFixed(2)}s 畫面 ${lab}`); lastShown = lab; }
        const change = auto.update(p, f.t, shown, current, true);
        if (!change) continue;
        const before = tracker.items.map(r => r.start.toFixed(2));
        const d = dropRecounted(tracker, change);
        log.push(`${(f.t / 1000).toFixed(2)}s 換成 ${change.workout}（from ${(change.from / 1000).toFixed(2)}，第一格 ${change.frames.length ? (change.frames[0].now / 1000).toFixed(2) : '-'}）原本 ${current} 每一下開始 [${before.join(', ')}]，拿掉 ${d}`);
        current = change.workout; tracker = new WorkoutTracker(current);
        meter.reset(); display.reset(); auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
        log.push(`   重算 ${tracker.items.length} 下：開始 [${tracker.items.map(r => r.start.toFixed(2)).join(', ')}]`);
    }
    log.push(`最後 ${current} ${tracker.items.length} 下：開始 [${tracker.items.map(r => r.start.toFixed(2)).join(', ')}]`);
    console.log(`多 ${extra} 格站著的深蹲；深蹲第一格 ${(firstSquat / 1000).toFixed(2)}s，每一下 81 格（2.70 秒）`);
    console.log(log.map(l => '  ' + l).join('\n'));
}
