import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8835)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for dsf in [1, 2]:
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=dsf, accept_downloads=True)
        pg = ctx.new_page()
        pg.goto(base + "replay.html"); pg.click("#demoSide"); pg.wait_for_timeout(500)
        pg.locator("#chart").scroll_into_view_if_needed()
        box = pg.query_selector("#chart").bounding_box()
        pg.mouse.click(box['x'] + box['width'] * 0.36, box['y'] + box['height'] / 2); pg.wait_for_timeout(200)
        try:
            with pg.expect_download(timeout=4000) as dl:
                pg.click("#csvOut", timeout=4000)
            print('dsf', dsf, 'ok')
        except Exception as e:
            print('dsf', dsf, 'FAIL', str(e).splitlines()[0])
            # 真實滑鼠點：先移到按鈕位置再按
            pg.locator("#csvOut").scroll_into_view_if_needed()
            r = pg.query_selector("#csvOut").bounding_box()
            with pg.expect_download(timeout=4000) as dl:
                pg.mouse.click(r['x'] + 10, r['y'] + 10)
            print('   real mouse click at button →', dl.value.suggested_filename)
        ctx.close()
    b.close()
