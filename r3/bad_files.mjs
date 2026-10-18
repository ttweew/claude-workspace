import { parseRecording, analyzeRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const good = makeDemoRecording({});
const base = { format: 'ai-sport-pose', version: 1, meta: { videoWidth: 640, videoHeight: 480 }, landmarkNames: undefined, frames: good.frames.slice(0, 120) };
const cases = {
  '時間缺漏': f => { f[10] = { ...f[10], t: null }; },
  '時間是字串': f => { f[10] = { ...f[10], t: 'abc' }; },
  '點少一個': f => { f[10] = { ...f[10], landmarks: f[10].landmarks.slice(0, 32) }; },
  '點不是陣列': f => { f[10] = { ...f[10], landmarks: 'x' }; },
  '某點是 null': f => { const l = f[10].landmarks.slice(); l[25] = null; f[10] = { ...f[10], landmarks: l }; },
  'frames 裡有 null': f => { f[10] = null; },
  '座標是字串': f => { const l = f[10].landmarks.map(p => p.slice()); l[25][0] = 'x'; f[10] = { ...f[10], landmarks: l }; },
};
for (const [name, mut] of Object.entries(cases)) {
  const frames = base.frames.map(f => ({ ...f }));
  mut(frames);
  let out;
  try {
    const parsed = parseRecording(JSON.stringify({ ...base, frames }));
    const r = await analyzeRecording(parsed, 640, 480, { lab: true });
    const nanAfter = [...r.angles.slice(50 * 9)].filter(Number.isNaN).length;
    out = `讀取成功 格數 ${r.n} 有人 ${r.present.reduce((a, b) => a + b, 0)} 第 50 格之後算不出的角度 ${nanAfter}/${r.angles.length - 50 * 9}`;
  } catch (e) { out = '錯誤：' + e.message; }
  console.log(name.padEnd(12), '→', out);
}
