from playwright.sync_api import sync_playwright
import http.server, threading, functools
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory="/home/user/claude-workspace")
s=http.server.ThreadingHTTPServer(("127.0.0.1",8765),h); threading.Thread(target=s.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium" if __import__('os').path.isfile("/opt/pw-browsers/chromium") else None,
        args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"])
    pg=b.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://127.0.0.1:8765/index.html")
    pg.click("#startBtn"); pg.wait_for_timeout(1500)
    print("status:",pg.inner_text("#status"))
    print("options:",pg.eval_on_selector_all("#cameraSelect option","e=>e.map(o=>o.textContent)"))
    print("videoW:",pg.evaluate("document.getElementById('video').videoWidth"))
    pg.screenshot(path="shot.png")
    pg.click("#stopBtn"); print("after stop:",pg.inner_text("#status"))
    print("errors:",errs)
    b.close()
