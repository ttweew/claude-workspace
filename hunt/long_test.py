import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8851)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for q in ['?lab=squat', '']:
        pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        cdp = pg.context.new_cdp_session(pg)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})  # 模擬手機 CPU（約慢 4 倍）
        pg.goto(base + "replay.html" + q)
        t0 = pg.evaluate("performance.now()")
        pg.set_input_files("#fileInput", HERE + "/long.json")
        pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=120000)
        t1 = pg.evaluate("performance.now()")
        heap = pg.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1")
        # 量一次重畫（拖曳時每次移動都要重畫）
        redraw = pg.evaluate("""(() => { const c = document.getElementById('chart'); const r = c.getBoundingClientRect();
            const t = performance.now(); for (let i = 0; i < 10; i++) { c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * (0.1 + i * 0.08), clientY: r.top + 50, pointerId: 1, bubbles: true })); }
            return (performance.now() - t) / 10; })()""")
        squat = pg.inner_text('#squatSummary') if pg.is_visible('#squatCard') else '-'
        print(f"[{q or 'plain'}] load+analyze {round(t1 - t0)} ms (CPU x4) | heap {heap} MB | one redraw {redraw:.0f} ms | squat: {squat} | errors {errs}")
        pg.close()
    b.close()
