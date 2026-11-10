// 正面站 5 秒之後轉成側身站，要站幾秒畫面上（ActivityDisplay）才寫「站著」（合成的火柴人）
const W = '/home/user/claude-workspace';
const D = await import('./demo_frames.mjs');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { ActivityMeter, ActivityDisplay } = await import(W + '/js/analysis/activity.js');
for (const lead of ['front', 'walk']) {
    const raw = [];
    for (let i = 0; i < 150; i++) raw.push(lead === 'front' ? D.front(1) : D.front(2.2 - 0.4 * Math.min(3, i / 30), { walk: i / 30 }));
    const turn = raw.length;
    for (let i = 0; i < 300; i++) raw.push(D.vis(D.clone(D.BASE)));
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay();
    let first = null;
    raw.forEach((lm, i) => {
        const t = Math.round(i * 1000 / 30);
        const shown = display.update(meter.update(pipeline.process(lm, t, 640, 480), t));
        if (first === null && i >= turn && shown && shown.label === 'stand') first = (i - turn) / 30;
    });
    console.log((lead === 'front' ? '正面站 5 秒' : '走遠＋正面站') + ' → 側身後 ' + first + ' 秒畫面上寫「站著」');
}
