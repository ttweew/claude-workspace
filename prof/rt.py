# 每一格來回時間（送出 → 結果回來）與偵測結果，比較 createImageBitmap 與 VideoFrame
import sys, json, statistics
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8892)
HOOK = """
window.__rt = []; window.__lm = [];
const _pm = Worker.prototype.postMessage; const sent = new Map();
Worker.prototype.postMessage = function (m, t) {
  if (m && m.type === 'detect') sent.set(m.id, performance.now());
  if (!this.__hooked) { this.__hooked = true; this.addEventListener('message', e => {
    const d = e.data; if (d && d.type === 'result' && sent.has(d.id)) { window.__rt.push(performance.now() - sent.get(d.id)); sent.delete(d.id);
      if (d.landmarks) window.__lm.push(d.landmarks[25].x.toFixed(4) + ',' + d.landmarks[25].y.toFixed(4)); }
    if (d && d.type === 'detect-error') window.__rt.push(-1);
  }); }
  return _pm.call(this, m, t);
};"""
FAKE_GPU = """for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const o = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : o.call(this, p); }; }"""
def run(vf, gpu):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
        pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        pg.route(CDN + "/**", lambda r: r.fulfill(path=PKG + r.request.url[len(CDN):].split("?")[0], content_type="application/wasm" if r.request.url.split('?')[0].endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480) + HOOK + ("window.__vf = true;" if vf else "") + (FAKE_GPU if gpu else ""))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(4000)
        pg.evaluate("window.__rt = []; window.__lm = []"); pg.wait_for_timeout(8000)
        rt = pg.evaluate("window.__rt"); lm = pg.evaluate("window.__lm")
        good = [x for x in rt if x >= 0]
        print(f"{'VideoFrame' if vf else 'ImageBitmap'} {'GPU' if gpu else 'CPU'} | {pg.inner_text('#perfBtn')} | {pg.inner_text('#poseStatus')} | 格數 {len(rt)} 出錯 {rt.count(-1)} | 來回 中位數 {statistics.median(good):.1f} ms p90 {sorted(good)[int(len(good)*.9)]:.1f} | 左膝 {sorted(set(lm))[:3]} | errors {errs}")
        b.close()
for gpu in (False, True):
    for vf in (False, True): run(vf, gpu)
