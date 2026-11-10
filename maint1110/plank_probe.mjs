// 11/10 保養：伏地挺身做完後停在撐著的姿勢（和棒式一樣）幾秒，AI 全自動會換成棒式？（合成的火柴人）
// 深蹲 4 下 → 站 2 秒 → 伏地挺身 4 下 → 撐著停 N 秒 → 起身站好 2 秒 → 正面走向手機 3 秒
const W = '/home/user/claude-workspace';
const D = await import('./demo_frames.mjs');
const { demoLandmarks } = await import(W + '/tests/helpers.mjs');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { AutoSegmenter } = await import(W + '/js/analysis/auto-segments.js');
const rep = (id, out) => { const add = d => out.push(demoLandmarks(id, d)); for (let i = 0; i <= 30; i++) add(i / 30); for (let i = 0; i < 10; i++) add(1); for (let i = 0; i <= 30; i++) add(1 - i / 30); for (let i = 0; i < 30; i++) add(0); };
for (const hold of [0, 1, 2, 3, 4, 5, 6, 8]) {
    const raw = [];
    for (let i = 0; i < 120; i++) raw.push(demoLandmarks('squat', 0));
    for (let r = 0; r < 4; r++) rep('squat', raw);
    for (let i = 0; i < 60; i++) raw.push(demoLandmarks('squat', 0));
    for (let r = 0; r < 4; r++) rep('pushup', raw);
    for (let i = 0; i < hold * 30; i++) raw.push(demoLandmarks('pushup', 0));
    for (let i = 0; i < 60; i++) raw.push(D.vis(D.clone(D.BASE)));
    for (let i = 0; i < 90; i++) raw.push(D.front(1 + 0.4 * i / 30, { walk: i / 30 }));
    const pipeline = new PosePipeline(), seg = new AutoSegmenter();
    raw.forEach((lm, i) => seg.update(pipeline.process(lm, Math.round(i * 1000 / 30), 640, 480), Math.round(i * 1000 / 30)));
    const segs = seg.done().map(s => s.workout + ' ' + s.items.length + (s.workout === 'plank' ? ' 次（' + s.items.map(h => (h.duration ?? h.seconds ?? JSON.stringify(h).slice(0, 60))).join('、') + '）' : ' 下'));
    console.log('撐著停 ' + hold + ' 秒 → ' + segs.join(' → '));
}
