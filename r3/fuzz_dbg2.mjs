// 每一格的運算流程模糊測試：大量垃圾資料 → 不能出錯、輸出不能有壞數字、垃圾過後要恢復正常
import { PosePipeline } from '/home/user/claude-workspace/js/skeleton/pipeline.js';
import { SquatCounter } from '/home/user/claude-workspace/js/analysis/squat.js';
import { predictPose } from '/home/user/claude-workspace/js/skeleton/predict.js';
import { framingAdvice, FramingHint } from '/home/user/claude-workspace/js/analysis/framing.js';
import { signedAngle, shortSegments } from '/home/user/claude-workspace/js/analysis/angles.js';
import { clearerSide, getDerivedPoints } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
const demo = makeDemoRecording({ yaw: 5, noisePx: 1 });
const good = i => demo.frames[i % demo.frames.length].landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
let seed = Number(process.argv[2] || 7);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = a => a[Math.floor(rnd() * a.length)];
const BAD = [NaN, Infinity, -Infinity, 1e9, -1e9, 0, 1, -0.5, 1.5, undefined, null, 1e-12];
function garbage(i) {
  const kind = Math.floor(rnd() * 8);
  const lm = good(i);
  if (kind === 0) return null;                                              // 沒有人
  if (kind === 1) return lm.map(p => ({ ...p, x: pick(BAD) }));               // x 全壞
  if (kind === 2) { const k = Math.floor(rnd() * 33); lm[k] = { ...lm[k], x: pick(BAD), y: pick(BAD), z: pick(BAD), visibility: pick(BAD) }; return lm; }
  if (kind === 3) return lm.map(p => ({ x: rnd() * 3 - 1, y: rnd() * 3 - 1, z: rnd() - .5, visibility: rnd() }));  // 亂跳
  if (kind === 4) return lm.map(p => ({ ...p, visibility: undefined }));    // 沒有可信度
  if (kind === 5) return lm.map(p => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));  // 全部疊在一點（長度 0）
  if (kind === 6) return lm.map(p => ({ ...p, x: p.x + 0.4 }));             // 整個跳開
  return lm;
}
const finiteOrNull = v => v === null || Number.isFinite(v);
let problems = [], frames = 0; globalThis.__log = [];
function check(where, cond, info) { if (!cond && problems.length < 15) problems.push(where + ' ' + info); }
for (const [W, H] of [[640, 480], [480, 640], [1, 1], [1920, 1080]]) {
  const pipe = new PosePipeline(), squat = new SquatCounter(), hint = new FramingHint();
  let t = 0, side = 'LEFT';
  for (let i = 0; i < 4000; i++) {
    // 時間：大多正常，偶爾不動、倒退、跳很遠
    const phase = Math.floor(i / 400) % 2;  // 400 格垃圾、400 格正常，交替
    // 時間：垃圾段落偶爾不動、倒退、跳很遠；正常段落正常往前（用來檢查垃圾過後能不能恢復）
    const r = rnd(); t += phase === 1 ? 33.3 : r < 0.03 ? 0 : r < 0.05 ? -500 : r < 0.07 ? 5000 : 33.3;
    const raw = phase === 0 ? garbage(i) : good(i);
    let p;
    if (W === 480 && i >= 1990 && i <= 2120 && i % 5 === 0) globalThis.__log.push(i + (raw ? '' : '(無)') + ' ghost=' + pipe.ghosts.ghostSize.toFixed(2) + ' 時間=' + Math.round(t) + ' shown=' + (pipe.ghosts.shown ? pipe.ghosts.shown.filter(Boolean).length : '-'));
    try {
      p = pipe.process(raw, t, W, H);
      squat.update(p, t);
      if (p) {
        const shown = predictPose(p.landmarks, pipe.smoother.velocity(), rnd() * 300 - 50, W, H);
        const d = getDerivedPoints(shown);
        for (const q of shown) check('預測', q && 'x' in q, 'missing');
        hint.update(framingAdvice(p.landmarks), t);
        side = clearerSide(p.landmarks, side);
        shortSegments(p.landmarks, W, H);
        for (const k of ['LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_HIP', 'RIGHT_HIP']) {
          const s = signedAngle(k, p.angles, p.landmarks, W, H, p.view.facing);
          check('有方向角度', finiteOrNull(s), k + '=' + s + ' 第' + i + '格');
        }
        for (const [k, v] of Object.entries(p.angles)) check('角度', finiteOrNull(v), k + '=' + v + ' 第' + i + '格');
        check('拍攝方向比值', finiteOrNull(p.view.ratio), String(p.view.ratio));
        // 正常段落：平滑後的點不應該是壞數字
        if (phase === 1 && i % 400 > 60) for (const q of p.landmarks) check('恢復', Number.isFinite(q.x) && Number.isFinite(q.y), `第${i}格 ${W}x${H} x=${q.x}`);
      } else if (phase === 1 && i % 400 > 60) check('恢復', false, `正常資料卻沒有人 第${i}格 ${W}x${H}`);
    } catch (e) { check('出錯', false, e.message + ' 第' + i + '格'); }
    frames++;
  }
  check('深蹲次數', Number.isFinite(squat.reps.length), '');
}
console.log('種子', process.argv[2] || 7, '格數', frames, '問題', problems.length, problems);

console.log(globalThis.__log.join('\n'));
