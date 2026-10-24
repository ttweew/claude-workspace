// 腳在畫面上的長度（腳跟到腳尖的左右距離）÷ 小腿長：腳尖朝鏡頭時變很短，重心的百分比會暴衝
import { readFileSync } from 'fs';
const ROOT = process.env.ROOT || '/home/user/claude-workspace';
const { parseRecording } = await import(ROOT + '/js/data/replay-core.js');
const { PosePipeline } = await import(ROOT + '/js/skeleton/pipeline.js');
const { isVisible, P, clearerSide } = await import(ROOT + '/js/skeleton/landmarks.js');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * p)] : NaN; };
for (const f of process.argv.slice(2)) {
  const p = parseRecording(readFileSync(f, 'utf8')); const W = p.meta.videoWidth, H = p.meta.videoHeight;
  const pl = new PosePipeline(); const r = [];
  for (const fr of p.frames) {
    const pose = pl.process(fr.raw, fr.t, W, H);
    if (!pose || pose.view.view === 'front') continue;
    const s = clearerSide(pose.landmarks), L = k => pose.landmarks[P[s + '_' + k]];
    if (![L('HEEL'), L('FOOT_INDEX'), L('KNEE'), L('ANKLE')].every(isVisible)) continue;
    const shank = Math.hypot((L('KNEE').x - L('ANKLE').x) * W, (L('KNEE').y - L('ANKLE').y) * H);
    r.push(Math.abs(L('FOOT_INDEX').x - L('HEEL').x) * W / shank);
  }
  console.log(f.split('/').pop().padEnd(20), r.length, [0.02, 0.1, 0.5, 0.9].map(x => q(r, x).toFixed(2)).join(' '));
}
