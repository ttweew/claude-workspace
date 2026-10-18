// 測試共用：產生合成深蹲資料（js/data/synth.js），轉成 AI 輸出的格式
import { makeDemoRecording } from '../js/data/synth.js';

export { makeDemoRecording };

// 合成資料的每一格 → { t, raw: 33 點 { x, y, z, visibility } 或 null, world: 33 點 { x, y, z } 或 null }
export function demoFrames(options = {}) {
    return makeDemoRecording(options).frames.map(f => ({
        t: f.t,
        raw: f.landmarks && f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
        world: f.world && f.world.map(([x, y, z]) => ({ x, y, z }))
    }));
}

// 可重現的亂數（同一個 seed 每次一樣）
export function random(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// 相鄰兩格平均差多少（抖動大小）
export function meanStep(values) {
    let sum = 0, n = 0;
    for (let i = 1; i < values.length; i++) {
        if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) {
            sum += Math.abs(values[i] - values[i - 1]);
            n++;
        }
    }
    return sum / n;
}
