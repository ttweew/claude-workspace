import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { SquatCounter, depthOf } from '/home/user/claude-workspace/js/analysis/squat.js';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
function run(opts, skip = null) {
    const rec = makeDemoRecording(opts);
    if (skip) rec.frames = rec.frames.filter(f => f.t < skip[0] * 1000 || f.t >= skip[1] * 1000);
    const pl = new PosePipeline(), sq = new SquatCounter();
    let prompts = 0, out;
    for (const f of rec.frames) {
        const raw = f.landmarks ? f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
        out = sq.update(pl.process(raw, f.t, 640, 480), f.t);
        if (out.prompt) prompts++;
    }
    return { reps: sq.reps, prompts, frames: rec.frames.length };
}
const fmt = reps => reps.map(r => Math.round(r.minKnee) + '°' + r.depth[0]).join(' ');
// 1. 不同拍攝角度（側面 → 斜側面）都要算對
const D = [95, 85, 125, 80, 92];
for (const yaw of [0, 8, 20, 28, 180, 200]) {
    const { reps } = run({ yaw, depths: D });
    const err = reps.length === D.length ? Math.max(...reps.map((r, i) => Math.abs(r.minKnee - D[i]))) : 999;
    // 深度判斷：真實深度離門檻（90°、110°）很近時，誤差範圍內判成哪一邊都合理，不算錯
    const tol = yaw % 180 > 20 ? 12 : 5;
    const nearLine = d => [90, 110].some(line => Math.abs(d - line) <= tol);
    const depthOk = reps.length === D.length && reps.every((r, i) => nearLine(D[i]) || r.depth === depthOf(D[i]));
    ok(reps.length === 5 && err < (yaw % 180 > 20 ? 12 : 5) && depthOk, `yaw ${yaw}°：${reps.length} 下（應為 5），最低膝蓋 ${fmt(reps)}，最大誤差 ${err.toFixed(1)}°`);
}
// 2. 正面拍：不算、要提醒
{
    const { reps, prompts, frames } = run({ yaw: 85, depths: D });
    ok(reps.length === 0 && prompts > frames * 0.9, `正面拍：${reps.length} 下，提醒 ${prompts}/${frames} 格`);
}
// 3. 雜訊大（3 像素）
{
    const { reps } = run({ yaw: 8, depths: D, noisePx: 3, seed: 3 });
    ok(reps.length === 5, `雜訊 3 像素：${reps.length} 下 ${fmt(reps)}`);
}
// 4. 只是小幅度晃動（膝蓋 150°）不算
{
    const { reps } = run({ yaw: 8, depths: [150, 148, 152, 145] });
    ok(reps.length === 0, `小幅度晃動（145～152°）：${reps.length} 下`);
}
// 5. 快（每下 1.2 秒）、慢（每下 7 秒，底部停 2 秒）
{
    const fast = run({ yaw: 8, depths: [90, 90, 90, 90, 90, 90], tempo: { down: 0.5, bottom: 0, up: 0.5, rest: 0.2 } });
    ok(fast.reps.length === 6, `快速（每下 1.2 秒）：${fast.reps.length} 下（應為 6） ${fmt(fast.reps)}`);
    const slow = run({ yaw: 8, depths: [85, 85, 85], tempo: { down: 2.5, bottom: 2, up: 2.5, rest: 0.5 } });
    ok(slow.reps.length === 3, `慢速（每下 7.5 秒、底部停 2 秒）：${slow.reps.length} 下（應為 3）`);
}
// 6. 蹲到一半人不見 2 秒（超過 1.5 秒）→ 那一下作廢；不見 0.5 秒 → 照算
{
    // 第 2 下在 1.5 + 2.4 + 1.0 秒左右在底部
    const lost = run({ yaw: 8, depths: D, gaps: [[4.4, 6.4]] });
    ok(lost.reps.length === 4, `第 2 下蹲到一半看不到人 2 秒：${lost.reps.length} 下（應為 4，那一下作廢）`);
    const blink = run({ yaw: 8, depths: D, gaps: [[4.7, 5.2]] });
    ok(blink.reps.length === 5, `第 2 下底部看不到人 0.5 秒：${blink.reps.length} 下（應為 5）`);
}
// 6b. 蹲到一半完全沒有畫面進來 2 秒（切到背景）→ 回來時站著，那一下作廢；0.5 秒照算
{
    const bg = run({ yaw: 8, depths: D }, [4.4, 6.4]);
    ok(bg.reps.length === 4, `第 2 下蹲到一半切到背景 2 秒（沒有畫面）：${bg.reps.length} 下（應為 4）`);
    const bg2 = run({ yaw: 8, depths: D }, [4.7, 5.2]);
    ok(bg2.reps.length === 5, `第 2 下底部沒有畫面 0.5 秒：${bg2.reps.length} 下（應為 5）`);
}
// 7. 一開始就蹲著（沒先站直）：第一下不算
{
    const { reps } = run({ yaw: 8, depths: D, lead: 0, tempo: { down: 0.01, bottom: 0.8, up: 1, rest: 0.5 } });
    ok(reps.length === 4, `一開始就蹲著：${reps.length} 下（應為 4，第一下沒先站直不算）`);
}
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
