import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8856)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "replay.html?lab=squat&demo"); pg.wait_for_timeout(600)
    order = []
    for i in range(40):
        pg.keyboard.press('Tab')
        order.append(pg.evaluate("(() => { const e = document.activeElement; return (e.id || e.tagName.toLowerCase() + (e.className ? '.' + e.className : '')) + (e.textContent && e.tagName !== 'TR' ? ':' + e.textContent.trim().slice(0, 8) : ''); })()"))
        if 'jump-row' in order[-1] and order.count(order[-1]) == 3: break
    print('Tab 順序：', order)
    # 跳到第 3 列按 Enter
    rows = pg.locator('#squatTable tbody tr')
    rows.nth(2).focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    print('第 3 列 Enter →', pg.inner_text('#readout').split('\n')[0])
    # 切換關節按鈕用空白鍵
    t = pg.locator('#toggles button').first; t.focus(); pg.keyboard.press(' '); pg.wait_for_timeout(100)
    print('空白鍵切換左膝 aria-pressed =', t.get_attribute('aria-pressed'))
    print('errors', errs)
    b.close()
