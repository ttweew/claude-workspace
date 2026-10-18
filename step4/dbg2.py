import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8833)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2, accept_downloads=True)
    pg = ctx.new_page()
    pg.goto(base + "replay.html"); pg.click("#demoSide"); pg.wait_for_timeout(500)
    pg.screenshot(path="dbg_full.png", full_page=True)
    pg.locator("#chart").scroll_into_view_if_needed()
    box = pg.query_selector("#chart").bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.36, box['y'] + box['height'] / 2); pg.wait_for_timeout(200)
    print('readout', pg.inner_text('#readout'))
    print(pg.evaluate("[window.scrollY, document.documentElement.scrollHeight]"))
    with pg.expect_download(timeout=5000) as dl:
        pg.click("#csvOut", timeout=5000)
    print('download ok', dl.value.suggested_filename)
    b.close()
