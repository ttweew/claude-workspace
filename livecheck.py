# 線上網站：新功能都在（PR1～PR7）
from playwright.sync_api import sync_playwright
URL = "https://ttweew.github.io/claude-workspace/"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "?sw=0", wait_until="networkidle"); pg.goto(URL, wait_until="networkidle"); pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => ({
        nav: getComputedStyle(document.querySelector('.nav-links a')).fontSize,
        cards: document.querySelectorAll('.exercises .demo-art').length,
        fps: [...document.querySelectorAll('#fpsSelect option')].map(o => o.textContent),
        demoBtn: !!document.getElementById('demoBtn'), soundBtn: !!document.getElementById('soundBtn'),
        limit: [...document.querySelectorAll('#limitSelect option')].map(o => o.textContent),
        hudSides: document.querySelectorAll('#hud .hud-side').length,
        heroAngle: document.getElementById('artAngle') && document.getElementById('artAngle').textContent,
        scripts: [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
    })""")
    for k, v in r.items(): print(k, v)
    print('errors', errs)
    pg.goto(URL + "replay.html", wait_until="networkidle")
    print('replay 3D 標題', [h.inner_text() for h in pg.locator('h2').all() if '3D' in h.inner_text()])
