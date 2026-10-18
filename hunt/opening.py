import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8858)
SLOW = cam_script(640, 480).replace("navigator.mediaDevices.getUserMedia = async () => {", "navigator.mediaDevices.getUserMedia = async () => { await new Promise(r => setTimeout(r, 1500));")
DENY = "navigator.mediaDevices.getUserMedia = async () => { await new Promise(r => setTimeout(r, 800)); throw new DOMException('denied', 'NotAllowedError'); };"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, script in [('slow', SLOW), ('deny', DENY)]:
        pg = b.new_page(viewport={"width": 320, "height": 568}, is_mobile=True, has_touch=True); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        mock_network(pg); pg.add_init_script(script)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_timeout(400)
        during = pg.inner_text('#status')
        hs = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        pg.screenshot(path=f"{HERE}/opening_{name}.png")
        pg.wait_for_timeout(1800)
        after = pg.inner_text('#status')
        print(f"[{name}] 等待中：{during!r} | 之後：{after!r} | 左右捲動 {hs} | errors {errs}")
        pg.close()
    b.close()
