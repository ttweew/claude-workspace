import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8877, '/home/user/claude-workspace')
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); mock_network(pg); pg.goto(base + 'index.html'); pg.wait_for_function(READY, timeout=60000)
    for w in (320, 360, 390, 1280):
        pg.set_viewport_size({"width": w, "height": 800}); pg.wait_for_timeout(200)
        r = pg.evaluate("""(() => { const els = [...document.querySelectorAll('.voice-modes span')].map(s => s.getBoundingClientRect());
            return { right: Math.max(...els.map(e => e.right)), rows: new Set(els.map(e => Math.round(e.top))).size, h: Math.min(...els.map(e => e.height)), sw: document.documentElement.scrollWidth }; })()""")
        print(w, r)
        pg.locator('.quick-settings').screenshot(path=f'{OUT}/pick_{w}.png')
    b.close()
