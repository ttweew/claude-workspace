// 背景執行緒用的假 MediaPipe（vision_bundle.js 的格式）：載入真的，再把偵測換成播放合成深蹲
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { writeFileSync } from 'fs';
for (const [name, yaw, loop] of [['side', 8, false], ['front', 85, false], ['loop', 8, true]]) {
    const rec = makeDemoRecording({ yaw });
    const frames = rec.frames.map(f => f.landmarks && { l: f.landmarks, w: f.world });
    writeFileSync(`fake_${name}.js`, `
importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle_real.js');
(() => {
const FRAMES = ${JSON.stringify(frames)};
const obj = a => a.map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
const objW = a => a.map(([x, y, z]) => ({ x, y, z }));
let t0 = null;
self.Vision.PoseLandmarker.createFromOptions = async () => ({
    detectForVideo(src, ts) {
        if (src.width === 64) return { landmarks: [], worldLandmarks: [] };   // 暖機
        if (t0 === null) t0 = ts;
        let i = Math.floor((ts - t0) / (1000 / 30));
        
        
        if (${loop}) i = i % FRAMES.length;
        const f = FRAMES[i];
        return f ? { landmarks: [obj(f.l)], worldLandmarks: [objW(f.w)] } : { landmarks: [], worldLandmarks: [] };
    },
    close() {}
});
})();
`);
    console.log(name, frames.length);
}
