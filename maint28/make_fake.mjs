// 假的 MediaPipe（10/28 保養：中途休息）：站直 2 秒 → 6 下（85°）＋3 下只蹲到約 102° → 站著休息 35 秒 → 再一次 6＋3 下 → 站直 2 秒
//   預期：運動中第 8 下、第 17 下各提醒一次「越來越淺了」（休息後重新算）；總結寫「中途休息了 3x 秒」，只比後面那一段（一樣長取後面的）
// 用法：node make_fake.mjs <網站資料夾>（做出 fake_rest.mjs/.js）
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
function rep(out, depth) {
    for (let i = 0; i <= 30; i++) out.push(enc(demoLandmarks('squat', depth * i / 30)));
    for (let i = 0; i < 15; i++) out.push(enc(demoLandmarks('squat', depth)));
    for (let i = 30; i >= 0; i--) out.push(enc(demoLandmarks('squat', depth * i / 30)));
    for (let i = 0; i < 40; i++) out.push(enc(demoLandmarks('squat', 0)));
}
const stand = (out, sec) => { for (let i = 0; i < FPS * sec; i++) out.push(enc(demoLandmarks('squat', 0))); };
const frames = [];
stand(frames, 2);
for (const part of [0, 1]) {
    for (let r = 0; r < 6; r++) rep(frames, 1);
    for (let r = 0; r < 3; r++) rep(frames, 0.8);
    stand(frames, part === 0 ? 35 : 2);
}
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
writeFileSync('fake_rest.mjs', `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
writeFileSync('fake_rest.js', `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
console.log('rest', frames.length, 'frames', (frames.length / FPS).toFixed(1), 's');
