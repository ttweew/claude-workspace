// 底部停 15 格（0.5 秒）的一下：WorkoutTracker 算出的重心前後晃動
const ROOT = process.argv[2];
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(ROOT + '/js/analysis/tracker.js');
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
for (const hold of [0, 15, 30, 60]) {
    const pl = new PosePipeline(), tr = new WorkoutTracker('squat');
    let t = 0; const reps = [];
    const feed = d => { const r = tr.update(pl.process(demoLandmarks('squat', d), t, 640, 480), t); if (r.done) reps.push(r.done.sway); t += 33; };
    for (let i = 0; i < 60; i++) feed(0);
    for (let r = 0; r < 2; r++) { for (let i = 0; i <= 30; i++) feed(i / 30); for (let i = 0; i < hold; i++) feed(1); for (let i = 30; i >= 0; i--) feed(i / 30); for (let i = 0; i < 40; i++) feed(0); }
    console.log('底部停', hold, '格', reps);
}
