import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8836)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = ctx.new_page()
    pg.goto(base + "replay.html"); pg.click("#demoSide"); pg.wait_for_timeout(500)
    print(pg.evaluate("""(() => {
      const vw = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > vw + 1).slice(0, 8).map(e => (e.id || e.tagName + '.' + e.className) + ':' + Math.round(e.getBoundingClientRect().right));
      return { vw, sw: document.documentElement.scrollWidth, innerWidth, vv: visualViewport.scale, wide };
    })()"""))
    b.close()
