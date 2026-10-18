# 量化抖動與延遲：同一段模擬影片（有雜訊的靜止畫面 + 左右移動），比較原始點與不同平滑參數
from playwright.sync_api import sync_playwright
from audit_common import *
import json, sys
url = serve(8852)
PARAMS = json.loads(sys.argv[1]) if len(sys.argv) > 1 else [[1.0, 8.0]]
HTML = """<!doctype html><script type=module>
import { loadPoseModel } from '/js/ai/pose.js';
const pose = await loadPoseModel(() => {});
const src = await (await fetch('/js/skeleton/smooth.js')).text();
const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
const W = 480, H = 640, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
const noise = g.createImageData(W, H);
// 模擬手機前鏡頭：直拿、人在畫面中間偏小，每格都有感光雜訊與輕微手震
function frame(i, offset) {
  g.fillStyle = '#5a88b8'; g.fillRect(0, 0, W, H);
  const s = W / 1000 * 0.75, dx = offset + (Math.random() - 0.5) * 8, dy = (Math.random() - 0.5) * 8;
  g.drawImage(im, 0, 0, 1000, 667, dx, 160 + dy, 1000 * s, 667 * s);
  const d = g.getImageData(0, 0, W, H);
  for (let k = 0; k < d.data.length; k += 4) { const n = (Math.random() - 0.5) * 100; d.data[k] += n; d.data[k+1] += n; d.data[k+2] += n; }
  g.putImageData(d, 0, 0);
}
const JOINTS = [11,12,13,14,15,16,23,24,25,26,27,28];
const frames = [];
let t = performance.now() + 1000;
// 前 60 格靜止（2 秒），接著 30 格以每秒 0.6 個畫面寬度往右移（快速動作），再靜止 30 格
for (let i = 0; i < 120; i++) {
  const off = i < 60 ? 0 : i < 90 ? (i - 60) / 30 * 0.6 * W * 0.5 : 0.3 * W;
  frame(i, off - 0);
  t += 50;  // 手機約 20 FPS
  const r = pose.landmarker.detectForVideo(c, t);
  frames.push({ t, off: off / W, lm: r.landmarks[0] ? r.landmarks[0].map(p => ({x: p.x, y: p.y, z: p.z, visibility: p.visibility})) : null });
}
const params = %s;
const out = {};
async function evaluate(name, mod) {
  const sm = mod ? new mod.PoseSmoother() : null;
  const pts = frames.map(f => f.lm ? (sm ? sm.smooth(f.lm, f.t) : f.lm) : null);
  let jit = 0, n = 0, lag = 0, m = 0;
  for (let i = 1; i < 60; i++) for (const j of JOINTS) { jit += Math.hypot((pts[i][j].x - pts[i-1][j].x) * W, (pts[i][j].y - pts[i-1][j].y) * H); n++; }
  // 延遲：移動期間，點的位置和「真實位置」（靜止時平均位置 + 實際位移）差多少像素
  const base = JOINTS.map(j => pts.slice(30, 60).reduce((a, p) => a + p[j].x, 0) / 30);
  for (let i = 60; i < 100; i++) JOINTS.forEach((j, k) => { lag += Math.abs((pts[i][j].x - (base[k] + frames[i].off)) * W); m++; });
  out[name] = { 抖動px: +(jit / n).toFixed(2), 移動時偏差px: +(lag / m).toFixed(1) };
}
await evaluate('原始', null);
for (const [mc, b, dc] of params) {
  const code = src.replace(/const MIN_CUTOFF = [\\d.]+/, 'const MIN_CUTOFF = ' + mc).replace(/const BETA = [\\d.]+/, 'const BETA = ' + b).replace(/const D_CUTOFF = [\\d.]+/, 'const D_CUTOFF = ' + (dc || 1));
  const mod = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  await evaluate(`min=${mc} beta=${b} d=${dc}`, mod);
}
window.OUT = out;
</script>""" % json.dumps(PARAMS)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); mock_network(pg)
    pg.route("**/__test/j.html", lambda r: r.fulfill(body=HTML, content_type="text/html; charset=utf-8"))
    pg.on("pageerror", lambda e: print("ERR", e))
    pg.goto(url + "__test/j.html"); pg.wait_for_function("window.OUT", timeout=180000)
    for k, v in pg.evaluate("window.OUT").items(): print(f"{k:22s} {v}")
    b.close()
