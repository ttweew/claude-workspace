import sys as _s; _s.path.insert(0, "/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad"); import swroute
from playwright.sync_api import sync_playwright
import http.server, threading, functools, sys
SP="/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad"
MP=SP+"/mp"; PKG=MP+"/node_modules/@mediapipe/tasks-vision"
CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
def serve(root, port):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*a): pass
    s=http.server.ThreadingHTTPServer(("127.0.0.1",port),functools.partial(Q,directory=root))
    threading.Thread(target=s.serve_forever,daemon=True).start()
def cdn(route):
    f=PKG+route.request.url[len(CDN):].split("?")[0]
    route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin":"*"})
PERSON_CAM = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im,0,0); let k=0; setInterval(() => { g.drawImage(im, 0, 0); g.fillStyle='#'+(k++%2?'000':'111'); g.fillRect(0,0,2,2); }, 33);
  return c.captureStream(30);
};"""
FAKE_GPU = """
for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
  const orig = C.prototype.getParameter;
  C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : orig.call(this, p); };
}"""
# 記下 MediaPipe 建立的 WebGL，之後可以模擬「GPU 失效」（手機切到背景常見）
TRACK_GL = """
window.__gls = [];
for (const C of [HTMLCanvasElement, OffscreenCanvas]) {
  const orig = C.prototype.getContext;
  C.prototype.getContext = function (type, ...a) { const c = orig.call(this, type, ...a); if (c && /webgl/.test(type)) window.__gls.push(c); return c; };
}
// 計算每秒程式被叫醒幾次
window.__wakes = 0;
const _raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = cb => _raf(t => { window.__wakes++; cb(t); });
const _rvfc = HTMLVideoElement.prototype.requestVideoFrameCallback;
if (_rvfc) HTMLVideoElement.prototype.requestVideoFrameCallback = function (cb) { return _rvfc.call(this, (t, m) => { window.__wakes++; cb(t, m); }); };
"""
def page(b, port, gpu=True, vw=1280, vh=720):
    pg=b.new_page(viewport={"width":vw,"height":vh}); errs=[]; logs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m: logs.append(m.type+": "+m.text[:120]))
    pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(PERSON_CAM); pg.add_init_script(TRACK_GL)
    if gpu: pg.add_init_script(FAKE_GPU)
    pg.goto(f"http://127.0.0.1:{port}/index.html")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
    return pg, errs, logs
def launch(p):
    return p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-fake-ui-for-media-stream"])
