// 試算：示範動畫（標準動作、完全不晃）的重心前後移動有多大；加雜訊、加晃動之後多大
const ROOT = '/home/user/claude-workspace';
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { balanceOf } = await import(ROOT + '/js/analysis/balance.js');
const { hipSag, bendDegrees } = await import(ROOT + '/js/analysis/form.js');
const { clearerSide, P } = await import(ROOT + '/js/skeleton/landmarks.js');
const { demoLandmarks, random } = await import(ROOT + '/tests/helpers.mjs');
const W = 640, H = 480;
const std = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
function run(id, { noise = 0, rock = 0, frames = 60 } = {}) {
    const pl = new PosePipeline(); const rnd = random(11);
    for (let i = 0; i < 30; i++) pl.process(demoLandmarks(id, 0), i * 33, W, H);
    const off = [];
    for (let i = 0; i <= frames; i++) {
        const d = i <= frames / 2 ? i / (frames / 2) : (frames - i) / (frames / 2);
        // rock：整個人（腳不動）前後晃：上半身和膝蓋 x 加 sin
        const dx = rock * Math.sin(i / frames * Math.PI * 4);
        const lm = demoLandmarks(id, d).map((p, k) => ({ ...p, x: p.x + (k < 25 ? dx : 0) + (rnd() - 0.5) * 2 * noise / W, y: p.y + (rnd() - 0.5) * 2 * noise / H }));
        const pose = pl.process(lm, (30 + i) * 33, W, H);
        const b = balanceOf(pose);
        if (b) off.push(b.offset);
    }
    return { n: off.length, std: +std(off).toFixed(2), min: Math.min(...off), max: Math.max(...off) };
}
for (const id of ['squat', 'lunge']) {
    console.log(id, 'clean', JSON.stringify(run(id)));
    console.log(id, 'noise1px', JSON.stringify(run(id, { noise: 1 })));
    console.log(id, 'noise3px', JSON.stringify(run(id, { noise: 3 })));
    console.log(id, 'rock0.01', JSON.stringify(run(id, { rock: 0.01 })));
    console.log(id, 'rock0.02', JSON.stringify(run(id, { rock: 0.02 })));
}
// 棒式：髖部彎幾度
function plank({ noise = 0, wobble = 0 } = {}) {
    const pl = new PosePipeline(); const rnd = random(5);
    const v = [];
    for (let i = 0; i < 300; i++) {
        const dy = wobble * Math.sin(i / 30 * 2 * Math.PI * 0.7);
        const lm = demoLandmarks('plank', 0).map((p, k) => ({ ...p, x: p.x + (rnd() - 0.5) * 2 * noise / W, y: p.y + ([P.LEFT_HIP, P.RIGHT_HIP].includes(k) ? dy : 0) + (rnd() - 0.5) * 2 * noise / H }));
        const pose = pl.process(lm, i * 33, W, H);
        const s = hipSag(pose, clearerSide(pose.landmarks));
        if (s !== null && i > 30) v.push(bendDegrees(s));
    }
    return { n: v.length, std: +std(v).toFixed(2), mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) };
}
console.log('plank clean', JSON.stringify(plank()));
console.log('plank noise1', JSON.stringify(plank({ noise: 1 })));
console.log('plank noise3', JSON.stringify(plank({ noise: 3 })));
console.log('plank wobble0.005', JSON.stringify(plank({ wobble: 0.005 })));
console.log('plank wobble0.01', JSON.stringify(plank({ wobble: 0.01 })));
