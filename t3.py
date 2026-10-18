from playwright.sync_api import sync_playwright
import http.server, threading, functools
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory="/home/user/claude-workspace")
s=http.server.ThreadingHTTPServer(("127.0.0.1",8767),h); threading.Thread(target=s.serve_forever,daemon=True).start()
tf="getComputedStyle(document.getElementById('video')).transform"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium",args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
    pg=b.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://127.0.0.1:8767/index.html")
    print("checkbox present:",pg.locator("#mirrorCheck").count())
    pg.click("#startBtn"); pg.wait_for_timeout(1500)
    print("status:",pg.inner_text("#status"),"| transform:",pg.evaluate(tf))
    pg.click("#stopBtn"); pg.click("#startBtn"); pg.wait_for_timeout(1000)
    print("reopen status:",pg.inner_text("#status"),"| transform:",pg.evaluate(tf))
    print("errors:",errs); b.close()
