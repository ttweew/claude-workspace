// 背景執行緒裡跑 YOLO（LiteRT.js）：收到 ImageBitmap → 縮成 320、補灰邊 → 跑模型 → 回傳 17 點和花的時間
// 一般的背景執行緒（不是 module）：LiteRT.js 在背景執行緒裡用 importScripts 載入引擎，module worker 不能用 importScripts
let loadLiteRt, loadAndCompile, Tensor;
const S = 320;
let model = null;
const cv = new OffscreenCanvas(S, S), g = cv.getContext('2d', { willReadFrequently: true }), input = new Float32Array(3 * S * S);
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const t0 = performance.now();
      ({ loadLiteRt, loadAndCompile, Tensor } = await import('./litert-core.js'));
      await loadLiteRt(new URL('../pkg/lrweb/node_modules/@litertjs/core/wasm/', self.location.href).href);
      model = await loadAndCompile(m.model, { accelerator: 'wasm' });
      self.postMessage({ type: 'ready', ms: performance.now() - t0 });
    } else if (m.type === 'detect') {
      const t0 = performance.now(), bmp = m.bitmap, W = bmp.width, H = bmp.height;
      const scale = Math.min(S / W, S / H), w = W * scale, h = H * scale, padX = (S - w) / 2, padY = (S - h) / 2;
      g.fillStyle = 'rgb(114,114,114)'; g.fillRect(0, 0, S, S); g.drawImage(bmp, padX, padY, w, h); bmp.close();
      const px = g.getImageData(0, 0, S, S).data, n = S * S;
      for (let i = 0; i < n; i++) { input[i] = px[i * 4] / 255; input[n + i] = px[i * 4 + 1] / 255; input[2 * n + i] = px[i * 4 + 2] / 255; }
      const t = new Tensor(input, [1, 3, S, S]); const res = await model.run(t); t.delete();
      const d = res[0].toTypedArray(); const cols = 57; let best = 0;
      for (let r = 1; r < d.length / cols; r++) if (d[r * cols + 4] > d[best * cols + 4]) best = r;
      const k = []; for (let j = 0; j < 17; j++) { const b = best * cols + 6 + j * 3; k.push([(d[b] - padX) / scale / W, (d[b + 1] - padY) / scale / H, d[b + 2]]); }
      const score = d[best * cols + 4]; for (const r of res) r.delete();
      self.postMessage({ type: 'result', score, k, ms: performance.now() - t0 });
    }
  } catch (err) { self.postMessage({ type: 'error', message: String(err && (err.stack || err.message) || err).slice(0, 500) }); }
};
