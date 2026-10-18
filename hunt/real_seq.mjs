// 真實 MediaPipe 輸出（鬼點模擬的 6 段，每段 240 格、480×640）丟進處理流程 + 深蹲計數，確認不會亂算
import { readFileSync } from 'fs';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { SquatCounter } from '/home/user/claude-workspace/js/analysis/squat.js';
const DIR = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/ghost2/';
for (const name of ['walk', 'close', 'panout', 'empty', 'dark', 'waistup']) {
    const d = JSON.parse(readFileSync(DIR + `seq_${name}_c0.5.json`));
    // 跑 3 圈（720 格），讓狀態有機會累積
    const pl = new PosePipeline(), sq = new SquatCounter();
    const views = {}, prompts = { n: 0 };
    let t = 0, shownKnee = 0, minKnee = 999, kneeRange = [999, 0];
    for (let lap = 0; lap < 3; lap++) for (const f of d.frames) {
        t += 33.333;
        const raw = f.pts ? f.pts.map(([x, y, z, v]) => ({ x, y, z, visibility: v })) : null;
        const p = pl.process(raw, t, 480, 640);
        const out = sq.update(p, t);
        if (out.prompt) prompts.n++;
        if (p) {
            views[p.view.view] = (views[p.view.view] || 0) + 1;
            for (const k of ['LEFT_KNEE', 'RIGHT_KNEE']) if (p.angles[k] !== null) { shownKnee++; kneeRange = [Math.min(kneeRange[0], p.angles[k]), Math.max(kneeRange[1], p.angles[k])]; }
        }
    }
    console.log(name.padEnd(8), 'reps', sq.reps.length, '| views', JSON.stringify(views), '| prompts', prompts.n, '| knee shown', shownKnee, 'range', kneeRange.map(Math.round).join('–'));
}
