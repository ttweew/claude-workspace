import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8819, ROOT)
src = open('fpspick.py', encoding='utf-8').read()
CAM = eval(src.split('CAM = ', 1)[1].split('\nopts = ')[0].replace('NO_COUNTDOWN + ', ''), {})
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 320, "height": 640}, is_mobile=True, has_touch=True); pg = ctx.new_page()
    mock_network(pg); pg.add_init_script(NO_COUNTDOWN + CAM % 60)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(2500)
    print(pg.evaluate("""() => { const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > 321 && r.width > 0) out.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); } return out.slice(0, 30); }"""))
    ctx.close()
