import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
import os
base = serve(8862, os.path.dirname(os.path.abspath(__file__)))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for mode, d in [('main', 'CPU'), ('worker', 'CPU'), ('main', 'GPU'), ('worker', 'GPU')]:
        pg = b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == 'error' and 'INFO' not in m.text else None)
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + f"proto.html?mode={mode}&d={d}")
        try: pg.wait_for_function("window.ready", timeout=60000)
        except Exception as e: print(mode, d, 'FAIL', errs[:3]); pg.close(); continue
        cdp = pg.context.new_cdp_session(pg); cdp.send("Performance.enable"); cdp.send("Emulation.setCPUThrottlingRate", {"rate": int(sys.argv[1]) if len(sys.argv) > 1 else 1})
        pg.wait_for_timeout(1500)
        s0 = pg.evaluate("({...stats})"); m0 = {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}
        pg.wait_for_timeout(8000)
        s1 = pg.evaluate("({...stats})"); m1 = {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}
        n = s1['frames'] - s0['frames']
        print(f"{mode:6} {d}: FPS {n/8:.1f} | 偵測 {((s1['detectMs']-s0['detectMs'])/max(n,1)):.0f} ms/格 | 主執行緒忙碌 {(m1['TaskDuration']-m0['TaskDuration'])/8*100:.0f}% | 找到人 {s1['found']-s0['found']}/{n} | errors {errs[:2]}")
        pg.close()
    b.close()
