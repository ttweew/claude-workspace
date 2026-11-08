// 假的 MediaPipe（11/8 保養：全部 AI 一起開，運動 30 分鐘）：一輪約 104 秒，一直重複、不會停
//   站 4 秒 → 深蹲 8 下 → 舉手（開始錄影）→ 深蹲 4 下 → 舉手（結束錄影）→ 伏地挺身 8 下 → 弓箭步 8 下 → 回到開頭
//   AI 全自動每一輪換 3 次動作（深蹲→伏地挺身→弓箭步→深蹲，每次都存一次運動）、手勢錄一段
// 用法：node make_fake_ai.mjs <網站資料夾>（做出 fake_ai.mjs、fake_ai.js）
import { writeFileSync } from 'fs';
const ROOT = process.argv[2];
const { script, rep } = await import(ROOT + '/tests/browser/harness.mjs');
const { demoLandmarks } = await import(ROOT + '/tests/helpers.mjs');
const { P } = await import(ROOT + '/js/skeleton/landmarks.js');
// 舉手（和 tests/browser/ai-all.test.mjs 一樣）
const base = demoLandmarks('squat', 0);
const nose = base[P.NOSE], shoulder = base[P.RIGHT_SHOULDER];
const toward = (p, x, y, f) => ({ ...p, x: p.x + (x - p.x) * f, y: p.y + (y - p.y) * f });
const raise = f => (p, k) => (k === P.RIGHT_WRIST ? toward(p, shoulder.x, nose.y - 0.15, f)
    : k === P.RIGHT_ELBOW ? toward(p, shoulder.x, (shoulder.y + nose.y) / 2 - 0.05, f) : p);
const stand = (id, frames) => ({ id, depth: 0, frames });
const hand = [
    ...[0.25, 0.5, 0.75].map(f => ({ id: 'squat', depth: 0, frames: 2, move: raise(f) })),
    { id: 'squat', depth: 0, frames: 80, move: raise(1) },
    ...[0.75, 0.5, 0.25].map(f => ({ id: 'squat', depth: 0, frames: 2, move: raise(f) }))
];
const reps = (id, n) => Array.from({ length: n }, () => rep(id, { hold: 10, rest: 20 })).flat();
const frames = script([stand('squat', 120), ...reps('squat', 8), stand('squat', 30), ...hand, stand('squat', 30), ...reps('squat', 4), stand('squat', 30), ...hand,
    stand('squat', 60), ...reps('pushup', 8), stand('pushup', 30), ...reps('lunge', 8), stand('lunge', 60)]);
const body = `const FRAMES = ${JSON.stringify(frames)};
const toPoints = f => f.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
const toWorld = f => f.map(([x, y]) => ({ x: x - 0.5, y: y - 0.5, z: 0 }));
let t0 = null;
const fake = {
    detectForVideo(source, ts) {
        if (source && source.width === 64) return { landmarks: [], worldLandmarks: [] };
        if (t0 === null) t0 = ts;
        const f = FRAMES[Math.floor((ts - t0) / (1000 / 30)) % FRAMES.length];
        return { landmarks: [toPoints(f)], worldLandmarks: [toWorld(f)] };
    },
    close() {}
};
const FilesetResolver = { async forVisionTasks(base) { return { wasmLoaderPath: base + '/vision_wasm_internal.js', wasmBinaryPath: base + '/vision_wasm_internal.wasm' }; } };
class PoseLandmarker { static async createFromOptions() { return fake; } }`;
writeFileSync('fake_ai.mjs', body + '\nexport { FilesetResolver, PoseLandmarker };\n');
writeFileSync('fake_ai.js', '(() => {\n' + body + '\nself.Vision = { FilesetResolver, PoseLandmarker };\n})();\n');
console.log('one loop', frames.length, 'frames', (frames.length / 30).toFixed(1), 's');
