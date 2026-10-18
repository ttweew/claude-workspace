from playwright.sync_api import sync_playwright
from audit_common import *
base = serve(8793)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    for q in ["", "?res=720", "?res=1080", "?res=abc"]:
        pg = b.new_page(viewport={"width": 1280, "height": 720}); mock_network(pg); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(6000); pg.click("#perfBtn"); pg.wait_for_timeout(1200)
        print(f"網址 index.html{q:10s} → {pg.inner_text('#perfBtn')} | 錯誤 {errs}")
        pg.close()
    b.close()
