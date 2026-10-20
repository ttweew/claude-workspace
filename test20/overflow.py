# 使用說明在 320 寬：誰超出畫面（右邊 > 320）
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(int(sys.argv[2]), sys.argv[1])
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 320, "height": 640})
    pg.goto(base + 'help.html'); pg.wait_for_timeout(800)
    print(sys.argv[1][-20:], 'scrollWidth', pg.evaluate("document.documentElement.scrollWidth"))
    print(pg.evaluate("""() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > 320.5 && r.width > 0; })
        .slice(0, 8).map(e => e.tagName + '#' + e.id + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' ' + (e.textContent || '').trim().slice(0, 40))"""))
