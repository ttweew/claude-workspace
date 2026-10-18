// 產生假的 MediaPipe 模組：偵測結果改成播放合成深蹲（測試鏡頭畫面的深蹲功能用）
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { writeFileSync } from 'fs';
for (const [name, yaw] of [['side', 8], ['front', 85]]) {
    const rec = makeDemoRecording({ yaw });
    const frames = rec.frames.map(f => f.landmarks && { l: f.landmarks, w: f.world });
    writeFileSync(`fake_${name}.mjs`, `
import * as real from './vision_bundle_real.mjs';
const FRAMES = ${JSON.stringify(frames)};
const obj = a => a.map(([x, y, z, v]) => ({ x, y, z, visibility: v }));
const objW = a => a.map(([x, y, z]) => ({ x, y, z }));
export const FilesetResolver = real.FilesetResolver;
export const DrawingUtils = real.DrawingUtils;
let t0 = null;
window.__fakeStart = () => { t0 = null; };
export class PoseLandmarker {
    static POSE_CONNECTIONS = real.PoseLandmarker.POSE_CONNECTIONS;
    static async createFromOptions() {
        return {
            detectForVideo(src, ts) {
                if (!(src instanceof HTMLVideoElement)) return { landmarks: [], worldLandmarks: [] };
                if (t0 === null) t0 = ts;
                const f = FRAMES[Math.floor((ts - t0) / (1000 / 30))];
                window.__fakeFrame = Math.floor((ts - t0) / (1000 / 30));
                return f ? { landmarks: [obj(f.l)], worldLandmarks: [objW(f.w)] } : { landmarks: [], worldLandmarks: [] };
            },
            close() {}
        };
    }
}
`);
    console.log(name, frames.length, 'frames');
}
