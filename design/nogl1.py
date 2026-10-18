# 沒有 WebGL（GPU 被瀏覽器停用的舊手機）、只有 WebGL1 時，AI 還能不能用
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8906, '/home/user/claude-workspace')
NOGL = """for (const C of [HTMLCanvasElement, typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : null]) { if (!C) continue;
  const o = C.prototype.getContext; C.prototype.getContext = function (t, ...a) { return /%s/.test(t) ? null : o.call(this, t, ...a); }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, pat in [('只有 WebGL1（沒有 WebGL2）', 'webgl2')]:
        for q in ('?worker=0',):
            ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:100])); logs = []
            pg.on("console", lambda m: logs.append(m.text[:160]) if m.type == 'error' else None)
            mock_network(pg)
            # 背景執行緒裡也要擋：用假的 MediaPipe 前先在 worker 裡蓋掉 getContext
            pg.add_init_script(cam_script(640, 480) + NOGL % pat)
            ctx.route("**/js/pose-worker.js*", lambda r, pat=pat: r.fulfill(body=(NOGL % pat) + "\n" + open('/home/user/claude-workspace/js/ai/pose-worker.js', encoding='utf-8').read().replace("\nfor (const C", "\nfor (const C"), content_type='text/javascript'))
            pg.goto(base + "index.html" + q)
            try: pg.wait_for_function(READY, timeout=60000)
            except Exception: pass
            pg.click('#startBtn'); pg.wait_for_timeout(5000)
            pg.click('#perfBtn')
            print(name, q or '(背景)', '|', pg.inner_text('#modelStatus'), '|', pg.inner_text('#perfBtn'), '|', pg.inner_text('#poseStatus'), '|', errs); print('   錯誤：', [l for l in logs if 'W1003' not in l][:3])
            ctx.close()
    b.close()
