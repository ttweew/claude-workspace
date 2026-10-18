import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8878, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
H = {"Access-Control-Allow-Origin": "*"}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); logs = []
    pg.on("console", lambda m: logs.append(m.type + ':' + m.text[:100]))
    def cdn(r):
        rel = r.request.url[len(CDN):].split("?")[0]
        if rel == '/vision_bundle.js': return r.fulfill(status=404, body='x', headers=H)
        r.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=H)
    pg.route(CDN + "/**", cdn)
    pg.route("https://unpkg.com/**", lambda r: r.fulfill(status=404, body='x', headers=H))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers=H))
    pg.add_init_script("window.__h=[]; new MutationObserver(() => { const e = document.getElementById('modelStatus'); if (e && window.__h[window.__h.length-1] !== e.textContent) window.__h.push((performance.now()/1000).toFixed(1) + ' ' + e.textContent); }).observe(document, {subtree: true, childList: true, characterData: true});")
    pg.goto(base + "index.html" + (sys.argv[2] if len(sys.argv) > 2 else "")); pg.wait_for_timeout(40000)
    for h in pg.evaluate("window.__h"): print(h)
    print('workers', len(pg.workers), 'sw', pg.evaluate("!!navigator.serviceWorker.controller"))
    for l in logs[:15]: print('  ', l)
    b.close()
