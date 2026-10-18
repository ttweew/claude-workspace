from playwright.sync_api import sync_playwright
from audit_common import *
base = serve(8792)
# 在開鏡頭時加上指定解析度，量實際拿到的解析度與穩定後的 FPS
PATCH = """const _g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = c => { const r = window.__res; if (r) c = {...c, video: {...(typeof c.video === 'object' ? c.video : {}), width: {ideal: r[0]}, height: {ideal: r[1]}}}; return _g(c); };"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    for res in [None, (640, 480), (1280, 720), (1920, 1080)]:
        vals = []
        for mode in ["", "?cpu"]:
            pg = b.new_page(viewport={"width": 1280, "height": 720}); mock_network(pg)
            pg.add_init_script(f"window.__res = {list(res) if res else 'null'};"); pg.add_init_script(PATCH)
            pg.goto(base + "index.html" + mode); pg.wait_for_function(READY, timeout=60000)
            pg.click("#startBtn"); pg.wait_for_timeout(7000)
            got = pg.evaluate("(() => { const v = document.getElementById('video'); return [v.videoWidth, v.videoHeight]; })()")
            fps = [pg.inner_text("#perfBtn")]
            for _ in range(2): pg.wait_for_timeout(1000); fps.append(pg.inner_text("#perfBtn"))
            vals.append(f"{'CPU' if mode else '預設'}: 實際 {got[0]}x{got[1]} {fps}")
            pg.close()
        print("指定", res or "（不指定，瀏覽器預設）", "|", " | ".join(vals))
    b.close()
