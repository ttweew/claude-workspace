// 示範動畫＋雜訊、前後晃：WorkoutTracker 算出的每一下重心前後晃動；棒式＋髖部上下晃
const ROOT = process.argv[2];
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(ROOT + '/js/analysis/tracker.js');
const { demoLandmarks, random } = await import(ROOT + '/tests/helpers.mjs');
const { P } = await import(ROOT + '/js/skeleton/landmarks.js');
const W = 640, H = 480;
function reps(id, { noise = 0, rock = 0 } = {}) {
    const pl = new PosePipeline(), tr = new WorkoutTracker(id), rnd = random(3);
    let t = 0, k = 0; const out = [];
    const feed = d => {
        const dx = rock * Math.sin(k++ / 30 * 2 * Math.PI);   // 每秒來回一次
        const lm = demoLandmarks(id, d).map((p, i) => ({ ...p, x: p.x + (i < 25 ? dx : 0) + (rnd() - 0.5) * 2 * noise / W, y: p.y + (rnd() - 0.5) * 2 * noise / H }));
        const r = tr.update(pl.process(lm, t, W, H), t); if (r.done) out.push(r.done.sway); t += 33;
    };
    for (let i = 0; i < 60; i++) feed(0);
    for (let r = 0; r < 3; r++) { for (let i = 0; i <= 30; i++) feed(i / 30); for (let i = 30; i >= 0; i--) feed(i / 30); for (let i = 0; i < 20; i++) feed(0); }
    return out;
}
for (const id of ['squat', 'lunge']) {
    console.log(id, 'clean', reps(id), 'noise1', reps(id, { noise: 1 }), 'noise3', reps(id, { noise: 3 }), 'rock±6px', reps(id, { rock: 0.01 }), 'rock±13px', reps(id, { rock: 0.02 }));
}
function plank({ noise = 0, wobble = 0, secs = 30 } = {}) {
    const pl = new PosePipeline(), tr = new WorkoutTracker('plank'), rnd = random(5);
    let t = 0, done = null;
    const n = secs * 30;
    for (let i = 0; i < n + 200; i++) {
        const standing = i >= n;   // 撐完起身（站著）
        const base = standing ? demoLandmarks('squat', 0) : demoLandmarks('plank', 0);
        const dy = standing ? 0 : wobble * Math.sin(i / 30 * 2 * Math.PI * 0.7);
        const lm = base.map((p, k) => ({ ...p, x: p.x + (rnd() - 0.5) * 2 * noise / W, y: p.y + ([P.LEFT_HIP, P.RIGHT_HIP].includes(k) ? dy : 0) + (rnd() - 0.5) * 2 * noise / H }));
        const r = tr.update(pl.process(lm, t, W, H), t); if (r.done) done = r.done; t += 33;
    }
    return done && { seconds: Math.floor(done.seconds), sway: done.sway, front: done.swayFront, back: done.swayBack, lf: done.levelFront, lb: done.levelBack };
}
console.log('plank clean', JSON.stringify(plank()));
console.log('plank noise1', JSON.stringify(plank({ noise: 1 })));
console.log('plank noise3', JSON.stringify(plank({ noise: 3 })));
console.log('plank wobble±2.4px', JSON.stringify(plank({ wobble: 0.005 })));
console.log('plank wobble±4.8px', JSON.stringify(plank({ wobble: 0.01 })));
console.log('plank 10s', JSON.stringify(plank({ secs: 10, wobble: 0.005 })));
