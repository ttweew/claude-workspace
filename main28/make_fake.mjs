// 假的 MediaPipe（10/28 疲勞分析）：
//   tired：站直 2 秒 → 深蹲 6 下（85°，每下約 2.5 秒）→ 6 下「累了」（只蹲到約 102°、每下約 4 秒）→ 站直 2 秒
//          預期：總結「變慢、變淺」；運動中第 8 下提醒「越來越淺了」
//   steady：站直 2 秒 → 8 下都一樣（85°）→ 站直 2 秒：預期「差不多」、不提醒
// 用法：node make_fake.mjs <網站資料夾>（做出 fake_tired.mjs/.js、fake_steady.mjs/.js）
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
function rep(out, depth, down, hold) {
    for (let i = 0; i <= down; i++) out.push(enc(demoLandmarks('squat', depth * i / down)));
    for (let i = 0; i < hold; i++) out.push(enc(demoLandmarks('squat', depth)));
    for (let i = down; i >= 0; i--) out.push(enc(demoLandmarks('squat', depth * i / down)));
    for (let i = 0; i < 40; i++) out.push(enc(demoLandmarks('squat', 0)));
}
const stand = out => { for (let i = 0; i < FPS * 2; i++) out.push(enc(demoLandmarks('squat', 0))); };
const tired = [], steady = [];
stand(tired);
for (let r = 0; r < 6; r++) rep(tired, 1, 30, 15);
for (let r = 0; r < 6; r++) rep(tired, 0.8, 50, 20);
stand(tired);
stand(steady);
for (let r = 0; r < 8; r++) rep(steady, 1, 30, 15);
stand(steady);
for (const [name, frames] of [['tired', tired], ['steady', steady]]) {
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
    console.log(name, frames.length, 'frames', (frames.length / FPS).toFixed(1), 's');
}
