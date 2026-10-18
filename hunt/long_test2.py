import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8852, sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    cdp = pg.context.new_cdp_session(pg)
    cdp.send("Performance.enable")
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.goto(base + "replay.html?lab=squat")
    pg.set_input_files("#fileInput", HERE + "/long.json")
    pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=120000)
    pg.wait_for_timeout(500)
    def task():
        return {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}['TaskDuration']
    t0 = task()
    pg.evaluate("""(async () => { const c = document.getElementById('chart'); const r = c.getBoundingClientRect();
        for (let i = 0; i < 20; i++) {
          c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * (0.05 + i * 0.045), clientY: r.top + 50, pointerId: 1, bubbles: true }));
          await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        } })()""")
    t1 = task()
    ro = pg.inner_text('#readout').split('\n')[0]
    # 切換關節（要重畫底圖）
    t2 = task()
    pg.evaluate("(async () => { document.querySelector('#toggles button').click(); await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); })()")
    t3 = task()
    print(f"per selection: {(t1 - t0) / 20 * 1000:.0f} ms main-thread (CPU x4) | toggle (base redraw): {(t3 - t2) * 1000:.0f} ms | readout {ro!r} | errors {errs}")
    pg.screenshot(path=HERE + "/long_phone.png", full_page=False)
    b.close()
