// 假的 MediaPipe：做錯的動作（測試錯誤判斷、標紅、語音）
import { demoLandmarks } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-s/tests/helpers.mjs';
import { P } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-s/js/skeleton/landmarks.js';
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
const sag = (lm, d) => move(lm, both('HIP'), 0, 0.05);
const lean = (lm, d) => move(lm, [...both('SHOULDER'), P.NOSE, ...both('EAR'), ...both('EYE'), ...both('EYE_INNER'), ...both('EYE_OUTER'), ...both('ELBOW'), ...both('WRIST'), ...both('PINKY'), ...both('INDEX'), ...both('THUMB')], 0.12 * d, 0.05 * d);
const knee = (lm, d) => move(lm, [P.LEFT_KNEE], 0.07 * d, 0);
// 手機放得高：站直時膝蓋看起來只有約 158°（示範動畫深度 0.12），先站著不動 2.5 秒，再蹲 3 下
function highCam() {
    const out = [];
    const push = d => out.push(enc(demoLandmarks('squat', d)));
    for (let i = 0; i < 75; i++) push(0.12);
    for (let k = 0; k < 3; k++) {
        for (let i = 0; i <= 30; i++) push(0.12 + 0.88 * i / 30);
        for (let i = 0; i < 10; i++) push(1);
        for (let i = 30; i >= 0; i--) push(0.12 + 0.88 * i / 30);
        for (let i = 0; i < 20; i++) push(0.12);
    }
    return out;
}
const SETS = { squat_high: highCam() };
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
