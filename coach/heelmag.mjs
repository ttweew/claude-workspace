// 單元測試用的示範動畫：腳跟往上移多少（比例座標），量到的「腳跟比腳尖高」是幾 %
const root = process.argv[2];
const { demoLandmarks } = await import(root + '/tests/helpers.mjs');
const { PosePipeline } = await import(root + '/js/skeleton/pipeline.js');
const { measure } = await import(root + '/js/analysis/form.js');
const { P } = await import(root + '/js/skeleton/landmarks.js');
for (const dy of [0, 0.03, 0.06, 0.09, 0.12, 0.15]) {
  const pl = new PosePipeline(); let m;
  for (let i = 0; i < 40; i++) {
    const lm = demoLandmarks('squat', 1).map((p, j) => [P.LEFT_HEEL, P.RIGHT_HEEL].includes(j) ? { ...p, y: p.y - dy } : p);
    const pose = pl.process(lm, i * 33, 640, 480); if (pose) m = measure(pose, 0);
  }
  console.log('腳跟往上', dy, '→ 腳跟比腳尖高', m && m.heel !== null ? Math.round(m.heel * 100) + '%' : '-', '膝', m && Math.round(m.knee));
}
