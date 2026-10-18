import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8841 + 1000, '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-pr6')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for q, vw, vh, mob in [('?lab=squat&demo', 1280, 900, False), ('?lab=squat&demo', 390, 844, True), ('?demo', 1280, 900, False)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "replay.html" + q); pg.wait_for_timeout(800)
        vis = pg.is_visible('#squatCard')
        summ = pg.inner_text('#squatSummary') if vis else '(hidden)'
        rows = pg.inner_text('#squatTable').split('\n')[1:] if vis else []
        if vis:
            pg.locator('#squatTable tbody tr').nth(2).click(); pg.wait_for_timeout(200)
        ro = pg.inner_text('#readout').split('\n')[0]
        sw = pg.evaluate("document.documentElement.scrollWidth")
        tag = ('lab' if 'lab' in q else 'nolab') + '_' + str(vw)
        pg.screenshot(path=f"replay_{tag}.png", full_page=True)
        print(f"[{tag}] squatCard={vis} summary={summ!r} rows={rows} readout-after-row3-click={ro!r} scrollWidth={sw} errors={errs}")
        ctx.close()
    b.close()
