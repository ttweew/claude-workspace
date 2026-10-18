import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PoseRecorder } from '/home/user/claude-workspace/js/data/recorder.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const demo = makeDemoRecording({});
const r = new PoseRecorder(); r.start({});
demo.frames.slice(0, 100).forEach(f => r.add(f.t, f.landmarks.map(([x, y, z, v]) => ({ x, y, z, visibility: v })), null));
const csv = r.toCSV();
for (const cut of [csv.length - 1, csv.length - 300, Math.floor(csv.length / 2)]) {
  try { console.log('切在', cut, '→ 讀到', parseRecording(csv.slice(0, cut)).frames.length, '格'); } catch (e) { console.log('切在', cut, '→ 錯誤', e.message); }
}
const lines = csv.split('\r\n'); lines[40] = lines[40].split(',').slice(0, 50).join(',');
try { parseRecording(lines.join('\r\n')); } catch (e) { console.log('中間一列被截斷 →', e.message); }
