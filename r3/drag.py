# 5 分鐘檔案：拖動游標時每一步要多久（4 倍慢的手機）
import sys, statistics
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8896, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
    pg.goto(base + "replay.html"); pg.set_input_files('#fileInput', '../hunt/long.json')
    pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=60000)
    cdp = pg.context.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    box = pg.query_selector('#chart').bounding_box()
    ms = pg.evaluate("""async ([x0, y, w]) => {
      const c = document.getElementById('chart'); const out = [];
      for (let i = 0; i < 60; i++) {
        const t = performance.now();
        c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0 + 50 + i * (w - 100) / 60, clientY: y, bubbles: true, pointerId: 1 }));
        c.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 + 50 + i * (w - 100) / 60, clientY: y, bubbles: true, pointerId: 1 }));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
        out.push(performance.now() - t);
      }
      return out;
    }""", [box['x'], box['y'] + box['height'] / 2, box['width']])
    print('每一步 中位數', round(statistics.median(ms), 1), 'ms 最慢', round(max(ms), 1), 'ms |', pg.inner_text('#readout').split('\n')[0], '| errors', errs)
    b.close()
