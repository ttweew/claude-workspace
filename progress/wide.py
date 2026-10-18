from playwright.sync_api import sync_playwright
import os, sys
D = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for f in sys.argv[1:]:
        for name, w, h, mob in [('lap', 1280, 900, False), ('ph', 390, 844, True)]:
            pg = b.new_page(viewport={'width': w, 'height': h}, is_mobile=mob, has_touch=mob)
            pg.goto('file://' + D + '/' + f); pg.wait_for_timeout(300)
            r = pg.evaluate("""(vw) => { const out = []; for (const e of document.querySelectorAll('body *')) { const r = e.getBoundingClientRect();
                if (r.right > vw + 1 && r.width > 0) { let inBox = e.closest('.table-box'); if (inBox && inBox !== e) continue; out.push([e.tagName, e.className, Math.round(r.right), (e.textContent || '').trim().slice(0, 40)]); } } return out.slice(0, 8); }""", w)
            print(f, name, pg.evaluate('document.documentElement.scrollWidth'), r)
            pg.close()
