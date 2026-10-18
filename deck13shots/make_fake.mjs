// 假的 MediaPipe：做錯的動作（測試錯誤判斷、標紅、語音）
import { demoLandmarks } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-h/tests/helpers.mjs';
import { P } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-h/js/skeleton/landmarks.js';
import { writeFileSync } from 'fs';
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
const both = n => [P['LEFT_' + n], P['RIGHT_' + n]];
const move = (lm, ids, dx, dy) => lm.map((p, i) => (ids.includes(i) ? { ...p, x: p.x + dx, y: p.y + dy } : p));
// 每一下可以指定怎麼做錯：edit(lm, d)
function reps(id, plan) {
    const out = [];
    const push = (d, edit) => out.push(enc(edit(demoLandmarks(id, d), d)));
    const ok = lm => lm;
    for (let i = 0; i < 45; i++) push(0, ok);
    for (const [depth, edit] of plan) {
        for (let i = 0; i <= 30; i++) push(depth * i / 30, edit);
        for (let i = 0; i < 15; i++) push(depth, edit);
        for (let i = 30; i >= 0; i--) push(depth * i / 30, edit);
        for (let i = 0; i < 20; i++) push(0, ok);
    }
    return out;
}
// 往下時腰慢慢塌（真人不會一下子跳過去）：下去一半以後就塌到底
const sag = (lm, d) => move(lm, both('HIP'), 0, 0.05 * Math.min(1, d * 2));
const lean = (lm, d) => move(lm, [...both('SHOULDER'), P.NOSE, ...both('EAR'), ...both('EYE'), ...both('EYE_INNER'), ...both('EYE_OUTER'), ...both('ELBOW'), ...both('WRIST'), ...both('PINKY'), ...both('INDEX'), ...both('THUMB')], 0.12 * d, 0.05 * d);
const knee = (lm, d) => move(lm, [P.LEFT_KNEE], 0.07 * d, 0);
const SETS = {
    squat5: reps('squat', [[1, x => x], [1, x => x], [0.75, x => x], [1, x => x], [1, x => x], [1, x => x]]),
    squat_mix: reps('squat', [[1, x => x], [1, lean], [0.7, x => x], [1, x => x]]),
    pushup_err: reps('pushup', [[1, x => x], [1, sag], [1, sag]]),
    squat_err: reps('squat', [[1, x => x], [1, lean]]),
    lunge_err: reps('lunge', [[1, knee], [1, x => x]])
};
for (const [name, frames] of Object.entries(SETS)) {
    const body = `const FRAMES = ${JSON.stringify(frames)};
const obj = a => a.map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
const objW = a => a.map(([x, y, z]) => ({ x, y, z }));
let t0 = null;
const fake = {
    detectForVideo(src, ts) {
        if (src.width === 64) return { landmarks: [], worldLandmarks: [] };
        if (t0 === null) t0 = ts;
        const f = FRAMES[Math.floor((ts - t0) / (1000 / 30))];
        return f ? { landmarks: [obj(f.l)], worldLandmarks: [objW(f.w)] } : { landmarks: [], worldLandmarks: [] };
    },
    close() {}
};`;
    writeFileSync(`fake_${name}.mjs`, `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
    writeFileSync(`fake_${name}.js`, `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
    console.log(name, (frames.length / 30).toFixed(1), 's');
}
