// 示範動畫走一遍 WorkoutTracker：每一下的重心前後晃動（網站實際會算出的）
const ROOT = process.argv[2];
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(ROOT + '/js/analysis/tracker.js');
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
for (const id of ['squat', 'lunge']) {
    for (const per of [30, 45, 60]) {
        const pl = new PosePipeline(), tr = new WorkoutTracker(id);
        let t = 0; const reps = [];
        const feed = lm => { const pose = pl.process(lm, t, 640, 480); const r = tr.update(pose, t); if (r.done) reps.push(r.done); t += 33; };
        for (let i = 0; i < 60; i++) feed(demoLandmarks(id, 0));
        for (let r = 0; r < 3; r++) {
            for (let i = 0; i <= per; i++) feed(demoLandmarks(id, i / per));
            for (let i = per; i >= 0; i--) feed(demoLandmarks(id, i / per));
            for (let i = 0; i < 20; i++) feed(demoLandmarks(id, 0));
        }
        console.log(id, 'frames/half', per, reps.map(r => r.sway));
    }
}
