# 量測「延遲感」：人突然移動時，畫面上的點要多久才跟上
# 模擬 30 FPS 鏡頭：靜止 1 秒 → 以「晃頭」的速度往右移動 0.4 秒 → 停住
# 指標：起步延遲（真實位置開始動後，點移動超過 5 像素要幾毫秒）、追上時間（停住後點回到 3 像素內要幾毫秒）、移動中平均落後像素
from playwright.sync_api import sync_playwright
from audit_common import *
import json, sys
url = serve(8851)
PARAMS = json.loads(sys.argv[1])
HTML = """<!doctype html><meta charset=utf-8><script type=module>
import { loadPoseModel } from '/js/ai/pose.js';
const pose = await loadPoseModel(() => {});
const src = await (await fetch('/js/skeleton/smooth.js')).text();
const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
const W = 640, H = 480, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
const N = 75, DT = 33.3;
const off = i => { const t = (i - 30) / 12; return i < 30 ? 0 : i < 42 ? 120 * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI)) : 120; };  // 0.4 秒內平滑移動 120 像素
const frames = []; let t = performance.now() + 1000;
for (let i = 0; i < N; i++) {
  g.fillStyle = '#5a88b8'; g.fillRect(0, 0, W, H);
  g.drawImage(im, 150, 150, 700, 517, off(i) - 60 + (Math.random() - .5) * 1.5, (Math.random() - .5) * 1.5, W, H * 517 / 700 * 640 / 640);
  t += DT; const r = pose.landmarker.detectForVideo(c, t);
  frames.push({ t, off: off(i), lm: r.landmarks[0] ? r.landmarks[0].map(p => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null });
}
const J = [0, 11, 12, 23, 24];  // 鼻子、肩、髖
const out = {};
function evaluate(name, mod) {
  const sm = mod ? new mod.PoseSmoother() : null;
  const pts = frames.map(f => sm ? sm.smooth(f.lm, f.t) : f.lm);
  const base = J.map(j => pts.slice(20, 30).reduce((a, p) => a + p[j].x * W, 0) / 10);
  const pos = i => J.reduce((a, j, k) => a + (pts[i][j].x * W - base[k]), 0) / J.length;  // 平均位移（像素）
  let start = null, catchUp = null, lag = 0;
  for (let i = 30; i < N; i++) {
    if (start === null && pos(i) > 5) start = (i - 30) * DT;
    if (i >= 30 && i < 42) lag += frames[i].off - pos(i);
    if (i >= 42 && catchUp === null && Math.abs(pos(i) - 120) < 3) catchUp = (i - 42) * DT;
  }
  let jit = 0; for (let i = 11; i < 30; i++) jit += J.reduce((a, j) => a + Math.hypot((pts[i][j].x - pts[i-1][j].x) * W, (pts[i][j].y - pts[i-1][j].y) * H), 0) / J.length;
  out[name] = { 起步延遲ms: Math.round(start), 停住後追上ms: catchUp === null ? '>1000' : Math.round(catchUp), 移動中落後px: +(lag / 12).toFixed(1), 靜止抖動px: +(jit / 19).toFixed(2) };
}
evaluate('不平滑（MediaPipe 原始）', null);
for (const [mc, b, dc] of %s) {
  const code = src.replace(/const MIN_CUTOFF = [\\d.]+/, 'const MIN_CUTOFF = ' + mc).replace(/const BETA = [\\d.]+/, 'const BETA = ' + b).replace(/const D_CUTOFF = [\\d.]+/, 'const D_CUTOFF = ' + dc);
  evaluate(`min=${mc} beta=${b} d=${dc}`, await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))));
}
window.OUT = out;
</script>""" % json.dumps(PARAMS)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); mock_network(pg)
    pg.route("**/__test/l.html", lambda r: r.fulfill(body=HTML, content_type="text/html; charset=utf-8"))
    pg.on("pageerror", lambda e: print("ERR", e))
    pg.goto(url + "__test/l.html"); pg.wait_for_function("window.OUT", timeout=300000)
    for k, v in pg.evaluate("window.OUT").items(): print(f"{k:26s} {v}")
    b.close()
