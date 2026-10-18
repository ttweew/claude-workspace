import sys, json, http.server, threading, functools
from playwright.sync_api import sync_playwright
SP="/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad"
PKG=SP+"/mp/node_modules/@mediapipe/tasks-vision"; CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
port=int(sys.argv[1]); conf=sys.argv[2]; names=sys.argv[3].split(','); frames=int(sys.argv[4]); model=sys.argv[5] if len(sys.argv)>5 else "lite"; mode=sys.argv[6] if len(sys.argv)>6 else "VIDEO"; seg=len(sys.argv)>7; tag=f"c{conf}" + ("" if model=="lite" and mode=="VIDEO" else f"_{model}_{mode}") + ("_seg" if seg else "")
s=http.server.ThreadingHTTPServer(("127.0.0.1",port),functools.partial(Q,directory=SP+"/ghost2")); threading.Thread(target=s.serve_forever,daemon=True).start()
def cdn(route):
    f=PKG+route.request.url[len(CDN):].split("?")[0]
    route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin":"*"})
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg=b.new_page(); pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=SP+"/mp/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://127.0.0.1:{port}/harness.html?conf={conf}&model={model}&mode={mode}" + ("&seg" if seg else "")); pg.wait_for_function("window.ready", timeout=60000)
    for n in names:
        r=pg.evaluate(f"run('{n}', {frames})")
        json.dump(r, open(f"seq_{n}_{tag}.json","w"))
        print(n, tag, "ms/frame", round(r["msPerFrame"],1), "seg ms", round(r.get("segMs",0),2), r.get("maskSize"), "gt found", r["gtFound"], "detected frames", sum(1 for f in r["frames"] if f["pts"]), "/", len(r["frames"]), errs)
    b.close()
