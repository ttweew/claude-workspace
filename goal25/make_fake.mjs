// 假的 MediaPipe（10/25 自訂目標）：
//   plank：站著 1 秒 → 趴好一直線 22 秒 → 起身 4 秒（目標 18 秒：10 秒報時、13～17 秒倒數、18 秒時間到、20 秒報時）
//   squat：站直 2 秒 → 深蹲 4 下（目標 3 下：第 3 下講「3 下，完成目標」，第 4 下照常「4 下」）
// 用法：node make_fake.mjs <網站資料夾>
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
const flat = demoLandmarks('plank', 0);
const up = flat.map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
const plank = [...Array(FPS * 1).fill(up), ...Array(FPS * 22).fill(flat), ...Array(FPS * 4).fill(up)].map(enc);
const squat = [];
for (let i = 0; i < FPS * 2; i++) squat.push(enc(demoLandmarks('squat', 0)));
for (let r = 0; r < 4; r++) {
    for (let i = 0; i <= 30; i++) squat.push(enc(demoLandmarks('squat', i / 30)));
    for (let i = 0; i < 15; i++) squat.push(enc(demoLandmarks('squat', 1)));
    for (let i = 30; i >= 0; i--) squat.push(enc(demoLandmarks('squat', i / 30)));
    for (let i = 0; i < 40; i++) squat.push(enc(demoLandmarks('squat', 0)));
}
for (let i = 0; i < FPS * 2; i++) squat.push(enc(demoLandmarks('squat', 0)));
for (const [name, frames] of [['plank', plank], ['squat', squat]]) {
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
    console.log(name, frames.length, 'frames');
}
