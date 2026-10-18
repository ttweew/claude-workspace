import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8903, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
out = sys.argv[2] if len(sys.argv) > 2 else 'after'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vw, vh, m in [('phone', 390, 844, True), ('small', 320, 640, True), ('laptop', 1280, 800, False)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2 if m else 1, is_mobile=m, has_touch=m)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        pg.goto(base + "help.html"); pg.wait_for_timeout(800)
        pg.click('summary >> nth=0')
        pg.screenshot(path=f"{out}/{name}_help.png", full_page=True)
        print(name, '橫向捲動', pg.evaluate("document.documentElement.scrollWidth > innerWidth"), '導覽列高', pg.evaluate("document.querySelector('.site-nav').offsetHeight"), errs)
        ctx.close()
    b.close()
