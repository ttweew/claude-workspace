# 首頁改版的截圖：電腦、手機直拿、手機橫拿；自由模式（第一次來）和上次選了深蹲
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8871, '/home/user/claude-workspace')
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw, vh, mobile in [(1280, 800, False), (390, 844, True), (320, 640, True)]:
        for state in ['free', 'squat']:
            ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
            ctx.route(CDN + "/**", lambda r: r.abort()); ctx.route(MODEL, lambda r: r.abort())
            ctx.route('https://www.gstatic.com/**', lambda r: r.abort())
            if state != 'free': ctx.add_init_script("try { localStorage.setItem('workout', '%s'); } catch (e) {}" % state)
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(base + 'index.html'); pg.wait_for_timeout(1200)
            pg.locator('.start-card').screenshot(path=f'{OUT}/card_{vw}_{state}.png')
            r = pg.evaluate("() => [document.documentElement.scrollWidth, innerWidth, document.getElementById('startBtn').className, document.getElementById('startBtn').textContent.trim(), [...document.querySelectorAll('#workoutGrid > button')].map(b => (b.hidden ? '-' : '') + b.dataset.workout + (b.id ? '#' + b.id : '')).join(' '), document.getElementById('freeBtn').hidden]")
            print(vw, state, r, errs[:2])
            ctx.close()
    b.close()
