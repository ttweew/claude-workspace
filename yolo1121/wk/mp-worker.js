// 背景執行緒裡跑 MediaPipe（和網站的 js/ai/pose-worker.js 一樣：一般的 Worker、importScripts、VIDEO 模式、CPU）
importScripts('../mp/node_modules/@mediapipe/tasks-vision/vision_bundle.js');
let landmarker = null, lastTs = -1;
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const t0 = performance.now();
      const fileset = await self.Vision.FilesetResolver.forVisionTasks(new URL('../mp/node_modules/@mediapipe/tasks-vision/wasm', self.location.href).href);
      landmarker = await self.Vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('../mp/pose_landmarker_' + (m.model || 'lite') + '.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1 });
      self.postMessage({ type: 'ready', ms: performance.now() - t0 });
    } else if (m.type === 'detect') {
      const t0 = performance.now();
      const ts = m.ts > lastTs ? m.ts : lastTs + 1; lastTs = ts;
      const r = landmarker.detectForVideo(m.bitmap, ts); m.bitmap.close();
      self.postMessage({ type: 'result', found: r.landmarks.length, ms: performance.now() - t0 });
    }
  } catch (err) { self.postMessage({ type: 'error', message: String(err && (err.stack || err.message) || err).slice(0, 400) }); }
};
