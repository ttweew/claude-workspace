from playwright.sync_api import sync_playwright
from audit_common import *
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for tag, d, port in [("before", "before_face", 8848), ("after", "/home/user/claude-workspace", 8849)]:
        u = serve(port, d)
        for kind, q in [("detect", ""), ("none", "")]:
            pg = b.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=3)
            mock_network(pg)
            if kind == "detect": pg.add_init_script(cam_script(480, 640))
            else: pg.add_init_script("navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width=480; c.height=640; const g=c.getContext('2d'); setInterval(()=>{g.fillStyle='#5a88b8'; g.fillRect(0,0,480,640)},33); return c.captureStream(30); };")
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(u); pg.wait_for_function(READY, timeout=60000); pg.click("#startBtn"); pg.wait_for_timeout(2500)
            pg.screenshot(path=f"hd_{tag}_{kind}.png")
            print(tag, kind, pg.inner_text("#poseStatus"), pg.evaluate("[overlay.width, overlay.height]"), errs); pg.close()
    b.close()
