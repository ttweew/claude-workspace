// 假的 MediaPipe（10/30 動作穩定度）
//   sway：站直 2 秒 → 深蹲 6 下（85°），前 3 下標準、後 3 下整個人（腳不動）每秒前後晃一次 ±13 像素 → 站直 2 秒
//     預期：總結「重心前後晃動…前段（第 1～2 下）2.3% → 後段（第 5～6 下）6～9%」，表格「晃動」前 3 下 2.3%
//   plank：棒式 26 秒，前 13 秒撐得很穩、後 13 秒髖部上下晃 ±4.8 像素 → 預期前段 ±0°、後段約 ±2.6°
//   pushup：伏地挺身 3 下（沒有穩定度）
// 用法：node make_fake.mjs <網站資料夾>（做出 fake_sway、fake_plank、fake_pushup 的 .mjs/.js）
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const { P } = await import(ROOT + '/js/skeleton/landmarks.js');
const FPS = 30;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
function write(name, frames) {
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
    writeFileSync(name + '.mjs', `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
    writeFileSync(name + '.js', `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
    console.log(name, frames.length, 'frames', (frames.length / FPS).toFixed(1), 's');
}
// sway
{
    const frames = [];
    let k = 0;
    const push = (id, d, rock) => {
        const dx = rock / 640 * Math.sin(k++ / FPS * 2 * Math.PI);
        frames.push(enc(demoLandmarks(id, d).map((p, i) => ({ ...p, x: p.x + (i < 25 ? dx : 0) }))));
    };
    for (let i = 0; i < FPS * 2; i++) push('squat', 0, 0);
    for (let r = 0; r < 6; r++) {
        const rock = r >= 3 ? 12.8 : 0;
        for (let i = 0; i <= 30; i++) push('squat', i / 30, rock);
        for (let i = 0; i < 15; i++) push('squat', 1, rock);
        for (let i = 30; i >= 0; i--) push('squat', i / 30, rock);
        for (let i = 0; i < 40; i++) push('squat', 0, 0);
    }
    for (let i = 0; i < FPS * 2; i++) push('squat', 0, 0);
    write('fake_sway', frames);
}
// plank
{
    const frames = [];
    for (let i = 0; i < FPS * 26; i++) {
        const dy = i >= FPS * 13 ? 0.01 * Math.sin(i / FPS * 2 * Math.PI * 0.7) : 0;
        frames.push(enc(demoLandmarks('plank', 0).map((p, k) => (k === P.LEFT_HIP || k === P.RIGHT_HIP ? { ...p, y: p.y + dy } : p))));
    }
    write('fake_plank', frames);
}
// pushup
{
    const frames = [];
    for (let i = 0; i < FPS * 2; i++) frames.push(enc(demoLandmarks('pushup', 0)));
    for (let r = 0; r < 3; r++) {
        for (let i = 0; i <= 30; i++) frames.push(enc(demoLandmarks('pushup', i / 30)));
        for (let i = 30; i >= 0; i--) frames.push(enc(demoLandmarks('pushup', i / 30)));
        for (let i = 0; i < 20; i++) frames.push(enc(demoLandmarks('pushup', 0)));
    }
    write('fake_pushup', frames);
}
