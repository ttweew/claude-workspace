from playwright.sync_api import sync_playwright
import os
D = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, w, h, mob in [('lap', 1280, 900, False), ('ph', 390, 844, True)]:
        pg = b.new_page(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=mob)
        pg.goto('file://' + D + '/progress_wrapped.html'); pg.wait_for_timeout(500)
        print(name, 'scrollWidth', pg.evaluate('document.documentElement.scrollWidth'), 'height', pg.evaluate('document.documentElement.scrollHeight'))
        # 表格有沒有超出外框（手機版可以在框內左右捲，但頁面本身不能橫向捲）
        wide = pg.evaluate("""() => [...document.querySelectorAll('.table-box')].map(b => [b.scrollWidth, b.clientWidth, (b.querySelector('th') || {}).textContent])""")
        print(name, 'table boxes', [x for x in wide if x[0] > x[1]])
        pg.screenshot(path=f'{D}/pm18_{name}_top.png', full_page=False)
        pg.locator('#planTitle').locator('xpath=ancestor::section').screenshot(path=f'{D}/pm18_{name}_plan.png')
        pg.locator('#recentTitle').locator('xpath=ancestor::section').screenshot(path=f'{D}/pm18_{name}_recent.png')
        pg.close()
