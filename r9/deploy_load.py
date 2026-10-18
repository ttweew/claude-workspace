import sys, os
sys.path.insert(0, '.')
from audit_common import *
from playwright.sync_api import sync_playwright
import http.server, threading, functools
root = sys.argv[1]
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
h.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8861), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:8861/'
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 720}); 
    reqs = []
    ctx.on("request", lambda r: reqs.append(r.url) if r.url.startswith(base) and r.url.split('?')[0].endswith('.js') else None)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' and not m.text.startswith('INFO:') else None)
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('已偵測到全身')", timeout=30000)
    pg.goto(base + "replay.html"); pg.click("#demoSide"); pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=20000)
    world = pg.is_visible("#worldCard")
    pg.goto(base + "help.html"); pg.click("#checkBtn"); pg.wait_for_timeout(500); verdict = pg.inner_text("#checkVerdict")
    files = sorted(set(u[len(base):] for u in reqs))
    nov = [u for u in files if '?v=' not in u and not u.startswith('sw.js')]
    print('JS 檔', len(set(u.split('?')[0] for u in files)), '沒版本號', nov)
    print('worker', [u for u in files if 'worker' in u])
    print('3D 卡片', world, '| 檢查', verdict, '| 錯誤', errs)
    b.close()
