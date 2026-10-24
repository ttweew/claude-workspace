// 假的 MediaPipe：深蹲 4 下：前 2 下腳跟貼地，後 2 下蹲下去時腳跟往上移小腿長的 25%（10/24 腳跟改成和站直時比）
// 用法：node make_fake.mjs <網站資料夾>
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const { P } = await import(ROOT + '/js/skeleton/landmarks.js');
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
const lm0 = demoLandmarks('squat', 0);
const W = 640, H = 480;
const shank = Math.hypot((lm0[P.LEFT_KNEE].x - lm0[P.LEFT_ANKLE].x) * W, (lm0[P.LEFT_KNEE].y - lm0[P.LEFT_ANKLE].y) * H);
const heels = [P.LEFT_HEEL, P.RIGHT_HEEL];
const pose = (d, lift) => demoLandmarks('squat', d).map((p, i) => (heels.includes(i) ? { ...p, y: p.y - lift * d * shank / H } : p));
const frames = [];
const push = (d, lift) => frames.push(enc(pose(d, lift)));
for (let i = 0; i < FPS * 2; i++) push(0, 0);
for (const lift of [0, 0, 0.25, 0.25]) {
    for (let i = 0; i <= 30; i++) push(i / 30, lift);
    for (let i = 0; i < 15; i++) push(1, lift);
    for (let i = 30; i >= 0; i--) push(i / 30, lift);
    for (let i = 0; i < 40; i++) push(0, lift);
}
for (let i = 0; i < FPS * 3; i++) push(0, 0);
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
writeFileSync('fake_heel.mjs', `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
writeFileSync('fake_heel.js', `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
console.log('heel', frames.length, 'frames');
