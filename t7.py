import sys as _s; _s.path.insert(0, "/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad"); import swroute
from playwright.sync_api import sync_playwright
import http.server, threading, functools
MP="/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/mp"
PKG=MP+"/node_modules/@mediapipe/tasks-vision"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
s=http.server.ThreadingHTTPServer(("127.0.0.1",8771),functools.partial(Q,directory="/home/user/claude-workspace")); threading.Thread(target=s.serve_forever,daemon=True).start()
CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
def cdn(route):
    f=PKG+route.request.url[len(CDN):].split("?")[0]
    route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin":"*"})
PERSON_CAM = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im,0,0); setInterval(() => g.drawImage(im, 0, 0), 33);
  return c.captureStream(30);
};"""
NO_WEBGL = """
for (const C of [HTMLCanvasElement, OffscreenCanvas]) {
  const orig = C.prototype.getContext;
  C.prototype.getContext = function (type, ...a) { return /webgl/.test(type) ? null : orig.call(this, type, ...a); };
}"""
FAKE_GPU = """
for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
  const orig = C.prototype.getParameter;
  C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : orig.call(this, p); };
}"""
MIR = "document.getElementById('overlay').classList.contains('mirrored')"
REAR_CAM = """
const _gum = navigator.mediaDevices.getUserMedia;
navigator.mediaDevices.getUserMedia = async (c) => {
  const st = await _gum(c);
  const t = st.getVideoTracks()[0]; const gs = t.getSettings.bind(t);
  t.getSettings = () => ({ ...gs(), facingMode: 'environment' });
  return st;
};"""

def run(b, name, query=""):
    pg=b.new_page(viewport={"width":1280,"height":720}); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(PERSON_CAM)
    pg.goto("http://127.0.0.1:8771/index.html"+query)
    pg.wait_for_function("(() => { const t = document.getElementById('poseStatus').textContent; return t.includes('已就緒') || t.includes('失敗'); })()", timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(2500)
    print(f"[{name}] start: btn={pg.inner_text('#labelBtn')}"); pg.screenshot(path=f"lbl_{name}_1.png")
    pg.click("#labelBtn"); pg.wait_for_timeout(800)
    print(f"[{name}] after click: btn={pg.inner_text('#labelBtn')}"); pg.screenshot(path=f"lbl_{name}_2.png")
    pg.click("#labelBtn"); pg.wait_for_timeout(800)
    print(f"[{name}] after 2nd click: btn={pg.inner_text('#labelBtn')}"); pg.screenshot(path=f"lbl_{name}_3.png")
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    print(f"[{name}] after close: {pg.inner_text('#status')} | errors: {errs}")
    pg.close()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
    run(b,"plain"); run(b,"debug","?debug"); b.close()
