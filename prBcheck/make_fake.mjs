// 假的 MediaPipe：播放示範動畫做成的伏地挺身、弓箭步、棒式（測試鏡頭畫面的運動模式）
import { demoLandmarks } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-b/tests/helpers.mjs';
import { P } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-b/js/skeleton/landmarks.js';
import { writeFileSync } from 'fs';
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
function reps(id, depths) {
    const out = [];
    const push = d => out.push(enc(demoLandmarks(id, d)));
    for (let i = 0; i < 45; i++) push(0);
    for (const d of depths) {
        for (let i = 0; i <= 30; i++) push(d * i / 30);
        for (let i = 0; i < 10; i++) push(d);
        for (let i = 30; i >= 0; i--) push(d * i / 30);
        for (let i = 0; i < 15; i++) push(0);
    }
    return out;
}
function plank() {
    const flat = demoLandmarks('plank', 0);
    const piked = flat.map((p, i) => (i === P.LEFT_HIP || i === P.RIGHT_HIP ? { ...p, y: p.y - 0.08 } : p));
    const up = flat.map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
    return [...Array(FPS * 8).fill(flat), ...Array(FPS * 2).fill(piked), ...Array(FPS * 4).fill(flat), ...Array(FPS * 5).fill(up)].map(enc);
}
const SETS = { pushup: reps('pushup', [1, 1, 0.5, 1]), lunge: reps('lunge', [1, 1, 0.5]), plank: plank() };
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
    console.log(name, frames.length, 'frames', (frames.length / 30).toFixed(1), 's');
}
