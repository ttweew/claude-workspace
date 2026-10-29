// 假的 MediaPipe（10/29 動作流暢度）：站直 2 秒 → 深蹲 6 下（85°），第 3 下下去到一半（約 126°）停 0.5 秒再繼續 → 站直 2 秒
//   預期：第 3 下提示寫「卡了一下」，總結「節奏穩（6 下有 6 下…）；1 下中途卡了一下（第 3 下）」
// 用法：node make_fake.mjs <網站資料夾>（做出 fake_stall.mjs/.js）
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
const frames = [];
const stand = sec => { for (let i = 0; i < FPS * sec; i++) frames.push(enc(demoLandmarks('squat', 0))); };
stand(2);
for (let r = 0; r < 6; r++) {
    for (let i = 0; i <= 30; i++) {
        frames.push(enc(demoLandmarks('squat', i / 30)));
        // 第 3 下：下去到一半停 0.5 秒（15 格）
        if (r === 2 && i === 15) for (let k = 0; k < 15; k++) frames.push(enc(demoLandmarks('squat', 0.5)));
    }
    for (let i = 0; i < 15; i++) frames.push(enc(demoLandmarks('squat', 1)));
    for (let i = 30; i >= 0; i--) frames.push(enc(demoLandmarks('squat', i / 30)));
    for (let i = 0; i < 40; i++) frames.push(enc(demoLandmarks('squat', 0)));
}
stand(2);
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
writeFileSync('fake_stall.mjs', `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
writeFileSync('fake_stall.js', `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
console.log('stall', frames.length, 'frames', (frames.length / FPS).toFixed(1), 's');
