// 原型：背景執行緒跑 MediaPipe
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
let lm = null;
self.onmessage = async e => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      importScripts(CDN + '/vision_bundle.js');
      const fileset = await Vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      const canvas = m.delegate === 'GPU' ? new OffscreenCanvas(1, 1) : undefined;
      lm = await Vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: new Uint8Array(m.model), delegate: m.delegate }, ...(canvas ? { canvas } : {}), runningMode: 'VIDEO', numPoses: 1 });
      postMessage({ type: 'ready' });
    } catch (err) { postMessage({ type: 'error', message: String(err && err.stack || err) }); }
  } else if (m.type === 'frame') {
    const t0 = performance.now();
    const r = lm.detectForVideo(m.bitmap, m.ts);
    m.bitmap.close();
    postMessage({ type: 'result', id: m.id, landmarks: r.landmarks[0] || null, ms: performance.now() - t0 });
  }
};
