import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8834)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2, accept_downloads=True)
    pg = ctx.new_page()
    pg.goto(base + "replay.html"); pg.click("#demoSide"); pg.wait_for_timeout(500)
    pg.locator("#chart").scroll_into_view_if_needed()
    box = pg.query_selector("#chart").bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.36, box['y'] + box['height'] / 2); pg.wait_for_timeout(200)
    pg.locator("#csvOut").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    print(pg.evaluate("""(() => { const r = document.getElementById('csvOut').getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      const secs = [...document.querySelectorAll('section')].map(s => { const q = s.getBoundingClientRect(); return [s.getAttribute('aria-labelledby'), Math.round(q.top), Math.round(q.bottom)]; });
      return [Math.round(r.top), Math.round(r.bottom), e && (e.id || e.tagName + '.' + e.className), window.scrollY, innerHeight, secs]; })()"""))
    pg.mouse.move(10, 10)
    print(pg.evaluate("""(() => { const r = document.getElementById('csvOut').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return e && (e.id || e.tagName); })()"""))
    b.close()
