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
PORTRAIT_CAM = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 720; c.height = 1280;
  const g = c.getContext('2d');
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, 720, 1280); g.drawImage(im, -180, 400, 1080, 720); };
  draw(); setInterval(draw, 33);
  return c.captureStream(30);
};"""
def shoot(b, tag, vw, vh, labels=False, portrait=True):
    ctx = b.new_context(viewport={"width":vw,"height":vh}, device_scale_factor=2, is_mobile=vw<600, has_touch=vw<600)
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(PORTRAIT_CAM if portrait else PERSON_CAM)
    pg.goto("http://127.0.0.1:8771/index.html")
    pg.wait_for_function("(() => { const t = document.getElementById('poseStatus').textContent; return t.includes('已就緒') || t.includes('失敗'); })()", timeout=60000)
    pg.screenshot(path=f"m_{tag}_home.png")
    pg.click("#startBtn"); pg.wait_for_timeout(3500)
    if labels: pg.click("#labelBtn"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"m_{tag}_cam.png")
    tb = pg.evaluate("(() => { const r = document.getElementById('toolbar').getBoundingClientRect(); return [Math.round(r.height)]; })()")
    hit = pg.evaluate("""(() => { const r = document.getElementById('poseStatus').getBoundingClientRect();
        const e = document.elementFromPoint(r.left + r.width/2, r.top + 3); return [Math.round(r.top), Math.round(r.bottom), e && e.id]; })()""")
    print(f"[{tag}] poseStatus pill top/bottom/topmost-element-at-its-top-edge={hit}")
    print(f"[{tag}] toolbar height={tb} pose={pg.inner_text('#poseStatus')} errors={errs}")
    ctx.close()
import sys
tag = sys.argv[1] if len(sys.argv) > 1 else "before"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
    shoot(b, tag+"_phone", 390, 844, labels=True)
    shoot(b, tag+"_small", 360, 740)
    shoot(b, tag+"_laptop", 1280, 720, portrait=False)
    b.close()
