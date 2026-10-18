import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8832)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.goto(base + "replay.html"); pg.click("#demoSide"); pg.wait_for_timeout(500)
    print(pg.evaluate("""(() => {
      const out = {};
      for (const id of ['chart','skeleton','csvOut','stats','result']) { const r = document.getElementById(id).getBoundingClientRect(); out[id] = [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]; }
      out.secs = [...document.querySelectorAll('section')].map(s => { const r = s.getBoundingClientRect(); return [s.getAttribute('aria-labelledby'), Math.round(r.top), Math.round(r.bottom), getComputedStyle(s).position, getComputedStyle(s).height]; });
      const c = document.getElementById('chart').getBoundingClientRect();
      const e = document.elementFromPoint(c.left + c.width * 0.36, c.top + c.height / 2);
      out.atChart = e && (e.id || e.tagName + '.' + e.className);
      out.docH = document.documentElement.scrollHeight;
      return out; })()"""))
    pg.mouse.wheel(0, 1500); pg.wait_for_timeout(300)
    print(pg.evaluate("""(() => { const r = document.getElementById('csvOut').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 5, r.top + 5); return [Math.round(r.top), e && (e.id || e.tagName + '.' + e.className), document.documentElement.scrollHeight, window.scrollY]; })()"""))
    b.close()
