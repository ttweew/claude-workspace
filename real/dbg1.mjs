import { readFileSync } from 'fs';
import { parseRecording } from '/home/user/claude-workspace/js/data/replay-core.js';
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { shortSegments, computeAngles } from '/home/user/claude-workspace/js/analysis/angles.js';
import { isVisible } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
const p = parseRecording(readFileSync('/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/2ef82f59-pose_20261005_133933.json', 'utf8'));
const pl = new PosePipeline();
for (const f of p.frames) {
  const out = pl.process(f.raw, f.t, 480, 640);
  if (out && [1000, 5000, 12000].some(t => Math.abs(f.t - t) < 17)) {
    const lm = out.landmarks;
    console.log('t', f.t, 'short', [...shortSegments(lm, 480, 640)], 'seen hip/knee/ankle L', [23, 25, 27].map(j => isVisible(lm[j])), 'R', [24, 26, 28].map(j => isVisible(lm[j])), 'vis', [23,25,27,24,26,28].map(j=>lm[j].visibility.toFixed(2)).join(','));
    const px = j => [lm[j].x * 480, lm[j].y * 640];
    const d = (a, b) => Math.hypot(px(a)[0] - px(b)[0], px(a)[1] - px(b)[1]).toFixed(0);
    console.log('  thigh L', d(23, 25), 'shank L', d(25, 27), 'torso', (Math.hypot((lm[11].x+lm[12].x-lm[23].x-lm[24].x)/2*480,(lm[11].y+lm[12].y-lm[23].y-lm[24].y)/2*640)).toFixed(0), 'upperArm L', d(11, 13), 'forearm L', d(13, 15));
  }
}
