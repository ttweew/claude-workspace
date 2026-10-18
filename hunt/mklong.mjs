import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { writeFileSync } from 'fs';
// 5 分鐘（錄製上限）：120 下深蹲
const depths = Array.from({ length: 120 }, (_, i) => 80 + (i * 7) % 50);
const rec = makeDemoRecording({ yaw: 8, depths, lead: 1.5 });
rec.frames = rec.frames.filter(f => f.t <= 300000);
writeFileSync('long.json', JSON.stringify(rec));
console.log('frames', rec.frames.length, 'seconds', rec.frames[rec.frames.length - 1].t / 1000);
