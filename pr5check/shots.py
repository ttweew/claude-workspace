# 示範動畫截圖：首頁卡片（電腦、手機），每個動作的起始、最低點
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8821, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vw, vh, mobile in [('desktop', 1280, 900, False), ('phone', 390, 844, True)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' else None)
        mock_network(pg)
        pg.goto(base + "index.html"); pg.wait_for_timeout(800)
        sec = pg.locator("section[aria-labelledby=exercisesTitle]")
        sec.scroll_into_view_if_needed(); pg.wait_for_timeout(400)
        # 定格：最低點（動畫一開始就在最低點）
        pg.evaluate("() => { window.__raf = window.requestAnimationFrame; }")
        sec.screenshot(path=f"{OUT}/cards_{name}.png")
        pg.wait_for_timeout(1700)
        sec.screenshot(path=f"{OUT}/cards_{name}_2.png")
        print(name, 'errors', errs, 'scrollWidth', pg.evaluate("document.documentElement.scrollWidth"))
        ctx.close()
