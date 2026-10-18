from playwright.sync_api import sync_playwright
import os
D = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, w, h, mob in [('lap', 1280, 900, False), ('ph', 390, 844, True)]:
        pg = b.new_page(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=mob)
        pg.goto('file://' + D + '/progress.html'); pg.wait_for_timeout(500)
        print(name, 'scrollWidth', pg.evaluate('document.documentElement.scrollWidth'), 'height', pg.evaluate('document.documentElement.scrollHeight'))
        pg.screenshot(path=f'{D}/pm13_{name}_top.png', full_page=False)
        sec = pg.locator('#recentTitle').locator('xpath=ancestor::section')
        sec.screenshot(path=f'{D}/pm13_{name}_recent.png')
        pg.close()
