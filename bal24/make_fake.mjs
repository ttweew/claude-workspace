// 假的 MediaPipe（10/24 平衡與重心）：站直 6 秒 → 上身往前倒 15° 2 秒 → 站直 2 秒 → 轉成正面 2 秒 → 沒有人
// 也算出站直、往前倒時網站應該算出的重心（node 跑同一套程式），check.py 拿來比對
// 用法：node make_fake.mjs <網站資料夾>
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const { P } = await import(ROOT + '/js/skeleton/landmarks.js');
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { balanceOf } = await import(ROOT + '/js/analysis/balance.js');
const { makeDemoRecording } = await import(ROOT + '/js/data/synth.js');
const W = 640, H = 480;
const enc = lm => ({ l: lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]), w: lm.map(p => [+(p.x - 0.5).toFixed(3), +(p.y - 0.5).toFixed(3), 0]) });
function lean(lm, deg) {
    const a = deg * Math.PI / 180, hip = lm[P.LEFT_HIP];
    return lm.map((p, i) => {
        if (i > 22) return p;
        const x = (p.x - hip.x) * W, y = (p.y - hip.y) * H;
        return { ...p, x: hip.x + (x * Math.cos(a) - y * Math.sin(a)) / W, y: hip.y + (x * Math.sin(a) + y * Math.cos(a)) / H };
    });
}
const stand = demoLandmarks('squat', 0), tilted = lean(stand, 15), front = demoLandmarks('squat', 0, { yaw: 1 });
const frames = [];
for (let i = 0; i < 180; i++) frames.push(enc(stand));
for (let i = 0; i < 60; i++) frames.push(enc(tilted));
for (let i = 0; i < 60; i++) frames.push(enc(stand));
for (let i = 0; i < 60; i++) frames.push(enc(front));
const expect = lm => { const pl = new PosePipeline(); let pose; for (let i = 0; i < 30; i++) pose = pl.process(lm, i * 33, W, H); return balanceOf(pose); };
// 重播用：合成示範資料（3D 火柴人）先站直 5 秒再蹲一下，摘要才有前後晃動
writeFileSync('stand.json', JSON.stringify(makeDemoRecording({ depths: [90], lead: 5 })));
writeFileSync('expected.json', JSON.stringify({ stand: expect(stand), tilted: expect(tilted) }));
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
writeFileSync('fake_bal.mjs', `import * as real from './vision_bundle_real.mjs';\n${body}\nexport const FilesetResolver = real.FilesetResolver;\nexport const DrawingUtils = real.DrawingUtils;\nexport class PoseLandmarker {\n    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;\n    static async createFromOptions() { return fake; }\n}\n`);
writeFileSync('fake_bal.js', `importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');\n(() => {\n${body}\nself.Vision.PoseLandmarker.createFromOptions = async () => fake;\n})();\n`);
console.log('balance', frames.length, 'frames');
