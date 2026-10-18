from playwright.sync_api import sync_playwright
import http.server, threading, functools, os, mimetypes
MP="/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/mp"
PKG=MP+"/node_modules/@mediapipe/tasks-vision"
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory="/home/user/claude-workspace")
class Q(h.func):
    def log_message(self,*a): pass
s=http.server.ThreadingHTTPServer(("127.0.0.1",8770),functools.partial(Q,directory="/home/user/claude-workspace")); threading.Thread(target=s.serve_forever,daemon=True).start()
CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
def cdn(route):
    path=route.request.url[len(CDN):].split("?")[0]
    f=PKG+path
    ct="application/wasm" if f.endswith(".wasm") else "text/javascript"
    route.fulfill(path=f, content_type=ct, headers={"Access-Control-Allow-Origin":"*"})
def model(route): route.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"})
def img(route): route.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg")
PERSON_CAM = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); setInterval(() => g.drawImage(im, 0, 0), 33); g.drawImage(im,0,0);
  return c.captureStream(30);
};"""
def run(b, name, person=True, block_cdn=False):
    pg=b.new_page(viewport={"width":1280,"height":720}); errs=[]; logs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m: logs.append(m.text) if m.type=="error" else None)
    if block_cdn: pg.route(CDN+"/**", lambda r: r.abort())
    else: pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", model)
    pg.route("**/__test/pose.jpg", img)
    if person: pg.add_init_script(PERSON_CAM)
    pg.goto("http://127.0.0.1:8770/index.html")
    pg.wait_for_function("document.getElementById('poseStatus').textContent !== '骨架模型載入中…'", timeout=60000)
    print(f"[{name}] model:", pg.inner_text("#poseStatus"))
    pg.click("#startBtn"); pg.wait_for_timeout(4000)
    print(f"[{name}] camera:", pg.inner_text("#status"), "| pose:", pg.inner_text("#poseStatus"),
          "| canvas:", pg.evaluate("[overlay.width, overlay.height].join('x')".replace("overlay","document.getElementById('overlay')")),
          "| mirrored:", pg.evaluate("document.getElementById('overlay').classList.contains('mirrored')"))
    pg.screenshot(path=f"{name}.png")
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    print(f"[{name}] after close:", pg.inner_text("#status"), "| stage visible:", pg.is_visible("#stage"))
    print(f"[{name}] page errors:", errs, "| console errors:", [l[:120] for l in logs][:3])
    pg.close()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
    run(b,"person")
    run(b,"noperson",person=False)
    run(b,"cdnfail",person=False,block_cdn=True)
    b.close()
