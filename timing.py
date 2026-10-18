from playwright.sync_api import sync_playwright
import http.server, threading, functools
MP="/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/mp"; PKG=MP+"/node_modules/@mediapipe/tasks-vision"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
s=http.server.ThreadingHTTPServer(("127.0.0.1",8772),functools.partial(Q,directory="/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/timing")); threading.Thread(target=s.serve_forever,daemon=True).start()
CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
def cdn(route):
    f=PKG+route.request.url[len(CDN):].split("?")[0]
    route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin":"*"})
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for i in range(2):
        pg=b.new_page(); pg.route(CDN+"/**", cdn)
        pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
        pg.goto("http://127.0.0.1:8772/index.html"); pg.wait_for_function("window.LOG", timeout=60000)
        print({k: round(v) for k,v in pg.evaluate("window.LOG").items()}); pg.close()
    b.close()
