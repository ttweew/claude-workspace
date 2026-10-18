import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
for (const yaw of [8, 90]) {
    const rec = makeDemoRecording({ yaw });
    const pl = new PosePipeline();
    const W = rec.meta.videoWidth, H = rec.meta.videoHeight;
    let minKnee = 999, views = {}, facing = {}, shown = 0, n = 0, mins = [], cur = 999, down = false;
    for (const f of rec.frames) {
        const raw = f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
        const r = pl.process(raw, f.t, W, H);
        n++;
        if (!r) continue;
        shown++;
        views[r.view.view] = (views[r.view.view] || 0) + 1;
        facing[r.view.facing] = (facing[r.view.facing] || 0) + 1;
        const k = r.angles.RIGHT_KNEE;
        if (k !== null) { minKnee = Math.min(minKnee, k); cur = Math.min(cur, k); if (k < 140) down = true; if (down && k > 165) { mins.push(Math.round(cur)); cur = 999; down = false; } }
    }
    console.log('yaw', yaw, 'frames', n, 'shown', shown, 'views', views, 'facing', facing, 'per-rep min right knee', mins, 'L/R vis sample', rec.frames[100].landmarks[25][3], rec.frames[100].landmarks[26][3]);
}
