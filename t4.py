from playwright.sync_api import sync_playwright
import http.server, threading, functools
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory="/home/user/claude-workspace")
s=http.server.ThreadingHTTPServer(("127.0.0.1",8768),h); threading.Thread(target=s.serve_forever,daemon=True).start()
rect="(()=>{const r=document.getElementById(ID).getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})()"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
    for name,vp in [("desktop",{"width":1280,"height":720}),("phone",{"width":390,"height":844})]:
        pg=b.new_page(viewport=vp); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto("http://127.0.0.1:8768/index.html")
        print(f"[{name}] stage visible before:",pg.is_visible("#stage"))
        pg.click("#startBtn"); pg.wait_for_timeout(1500)
        print(f"[{name}] status:",pg.inner_text("#status"),"| stage:",pg.evaluate(rect.replace("ID","'stage'")),"| video:",pg.evaluate(rect.replace("ID","'video'")),
              "| mirrored:",pg.evaluate("document.getElementById('video').classList.contains('mirrored')"),
              "| fsBtn visible:",pg.is_visible("#fullscreenBtn"))
        pg.screenshot(path=f"{name}.png")
        pg.select_option("#cameraSelect",index=0); pg.wait_for_timeout(800)
        print(f"[{name}] after switch stage visible:",pg.is_visible("#stage"),"| status:",pg.inner_text("#status"))
        pg.click("#fullscreenBtn"); pg.wait_for_timeout(500)
        print(f"[{name}] fullscreen:",pg.evaluate("!!document.fullscreenElement"),"| btn:",pg.inner_text("#fullscreenBtn"))
        pg.click("#stopBtn"); pg.wait_for_timeout(500)
        print(f"[{name}] after close: stage visible:",pg.is_visible("#stage"),"| fullscreen:",pg.evaluate("!!document.fullscreenElement"),"| status:",pg.inner_text("#status"),"| startBtn visible:",pg.is_visible("#startBtn"))
        print(f"[{name}] errors:",errs); pg.close()
    b.close()
