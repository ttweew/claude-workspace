// 假的 MediaPipe（10/29 保養：運動 30 分鐘）：站直 2 秒後一直重複做深蹲（每 10 下一輪，每下約 3 秒；第 4 下比較淺、第 7 下中途卡一下），不會停
// 用法：node make_fake.mjs <網站資料夾>（做出 fake_loop.mjs/.js）
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
const frames = [];
for (let r = 0; r < 10; r++) {
    const depth = r === 3 ? 0.8 : 1;
    for (let i = 0; i <= 30; i++) {
        frames.push(enc(demoLandmarks('squat', depth * i / 30)));
        if (r === 6 && i === 15) for (let k = 0; k < 12; k++) frames.push(enc(demoLandmarks('squat', 0.5)));
    }
    for (let i = 0; i < 10; i++) frames.push(enc(demoLandmarks('squat', depth)));
    for (let i = 30; i >= 0; i--) frames.push(enc(demoLandmarks('squat', depth * i / 30)));
    for (let i = 0; i < 25; i++) frames.push(enc(demoLandmarks('squat', 0)));
}
const lead = Array.from({ length: 60 }, () => enc(demoLandmarks('squat', 0)));
const body = `const LEAD = ${JSON.stringify(lead)};
const FRAMES = ${JSON.stringify(frames)};
const obj = a => a.map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
const objW = a => a.map(([x, y, z]) => ({ x, y, z }));
let t0 = null;
const fake = {
    detectForVideo(src, ts) {
        if (src.width === 64) return { landmarks: [], worldLandmarks: [] };
        if (t0 === null) t0 = ts;
        const i = Math.floor((ts - t0) / (1000 / 30));
        const f = i < LEAD.length ? LEAD[i] : FRAMES[(i - LEAD.length) % FRAMES.length];
        return { landmarks: [obj(f.l)], worldLandmarks: [objW(f.w)] };
    },
    close() {}
};`;
writeFileSync('fake_loop.mjs', `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
writeFileSync('fake_loop.js', `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
console.log('loop', frames.length, 'frames', (frames.length / 30).toFixed(1), 's per 10 reps');
