// 慢的裝置（每秒格數很低）也要偵測得到人；中間偶爾漏一格也要接得上
import { PosePipeline } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/deploy3/js/skeleton/pipeline.js';
import { makeDemoRecording } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/deploy3/js/data/synth.js';
let ok = true;
for (const fps of [3, 4, 8, 15, 30]) for (const drop of [0, 7]) {
  const rec = makeDemoRecording({ fps, noisePx: 1.5 });
  const pipe = new PosePipeline(); let seen = 0, n = 0;
  rec.frames.forEach((f, i) => {
    const raw = f.landmarks && !(drop && i % drop === 3) ? f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
    const p = pipe.process(raw, f.t, 640, 480);
    if (f.t > 1500 && raw) { n++; if (p && p.landmarks.some(q => q.visible)) seen++; }
  });
  const pct = 100 * seen / n; if (pct < 90) ok = false;
  console.log(`每秒 ${fps} 格${drop ? '、每 ' + drop + ' 格漏 1 格' : ''}：有畫出骨架的格 ${pct.toFixed(0)}%`);
}
console.log(ok ? '全部通過' : '有失敗');
