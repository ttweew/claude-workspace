from playwright.sync_api import sync_playwright
from audit_common import *
import os
for label, site, port in [("修改前", os.getcwd() + "/oldsite", 8783), ("修改後", "/home/user/claude-workspace", 8784)]:
    base = serve(port, site)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", headless=False, args=["--headless=new"])
        pg = b.new_page(); mock_network(pg); reqs = []; bad = []
        pg.on("request", lambda r: reqs.append(r.url))
        pg.on("response", lambda r: bad.append(r.url) if r.status >= 400 else None)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000); pg.wait_for_timeout(1000)
        pad = pg.evaluate("getComputedStyle(document.body).padding")
        print(f"{label}：favicon 請求 {sum('favicon' in u for u in reqs)} 次，錯誤回應 {bad}，首頁留白 {pad}")
        b.close()
