import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { SquatCounter } from '/home/user/claude-workspace/js/analysis/squat.js';
const D = [95, 85, 125, 80, 92];
console.log('yaw | 算到幾下 | 比值範圍（站直 → 蹲最低） | 判斷分布 | 提示格數');
for (const yaw of [24, 26, 28, 30, 32, 34, 36, 38, 40, 45]) {
    const rec = makeDemoRecording({ yaw, depths: D });
    const pl = new PosePipeline(), sq = new SquatCounter();
    const views = {}; let rmin = 9, rmax = 0, prompts = 0;
    for (const f of rec.frames) {
        const p = pl.process(f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })), f.t, 640, 480);
        const o = sq.update(p, f.t);
        if (o.prompt) prompts++;
        if (p && p.view.ratio !== null) { rmin = Math.min(rmin, p.view.ratio); rmax = Math.max(rmax, p.view.ratio); views[p.view.view] = (views[p.view.view] || 0) + 1; }
    }
    console.log(String(yaw).padStart(3), '|', sq.reps.length, '|', rmin.toFixed(2), '–', rmax.toFixed(2), '|', JSON.stringify(views), '|', prompts);
}
