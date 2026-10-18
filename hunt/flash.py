# 打開鏡頭、人走進畫面時，前 2 秒狀態與橫幅的變化（找「太近了」誤閃）
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8853, sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace")
SCENE = cam_script(640, 480).replace("const draw = () => {", "const draw = () => { if (window.__empty) { g.fillStyle = '#334'; g.fillRect(0, 0, c.width, c.height); return; }")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    pg = b.new_page(viewport={"width": 390, "height": 844})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(SCENE)
    pg.add_init_script("""window.__log = []; const t0 = performance.now();
      new MutationObserver(() => { const s = document.getElementById('poseStatus'), b = document.getElementById('banner'); if (!s) return;
        const v = (b.hidden ? '' : '[橫幅]' + b.textContent) + ' | ' + (s.hidden ? '' : s.textContent);
        if (window.__log.length === 0 || window.__log[window.__log.length - 1].v !== v) window.__log.push({ t: Math.round(performance.now() - (window.__t0 || t0)), v }); })
      .observe(document, { subtree: true, childList: true, characterData: true, attributes: true });""")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.evaluate("window.__log = []; window.__t0 = performance.now()")
    pg.click("#startBtn"); pg.wait_for_timeout(2000)
    print("開鏡頭：", [(e['t'], e['v']) for e in pg.evaluate("window.__log")])
    pg.evaluate("window.__empty = true"); pg.wait_for_timeout(1500)
    pg.evaluate("window.__log = []; window.__t0 = performance.now(); window.__empty = false"); pg.wait_for_timeout(2000)
    print("人走進來：", [(e['t'], e['v']) for e in pg.evaluate("window.__log")])
    print('errors', errs)
    b.close()
