# 存在手機裡的模型壞掉 → 有網路時自動清掉、重新下載 → 恢復
import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8883, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
UNPKG = "https://unpkg.com/@mediapipe/tasks-vision@1.0.1"
hits = []
def cdn(prefix):
    def h(route):
        f = PKG + route.request.url[len(prefix):].split("?")[0]
        route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    return h
def model(r): hits.append('model'); r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"})
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.route(CDN + "/**", cdn(CDN)); ctx.route(UNPKG + "/**", cdn(UNPKG)); ctx.route(MODEL, model)
    ctx.add_init_script(cam_script(640, 480))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    W = "document.getElementById('modelStatus').textContent.match(/已就緒|請檢查網路/)"
    for i in range(3):
        pg.goto(base + "index.html"); pg.wait_for_function(W, timeout=90000); pg.wait_for_timeout(1500)
    keys = pg.evaluate("caches.open('ai-files-v1').then(c => c.keys()).then(k => k.map(r => r.url.split('/').pop()))")
    # 把存起來的模型換成壞掉的內容
    pg.evaluate("""async () => { const c = await caches.open('ai-files-v1'); const k = (await c.keys()).find(r => r.url.includes('pose_landmarker'));
      await c.put(k, new Response(new Uint8Array(5000).fill(7), { headers: { 'Content-Type': 'application/octet-stream' } })); }""")
    hits.clear(); hist = []
    pg.goto(base + "index.html")
    t0 = time.time()
    pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|請檢查網路/)", timeout=120000)
    st = pg.inner_text('#modelStatus')
    pg.click('#startBtn'); pg.wait_for_timeout(4000)
    print(('PASS' if '已就緒' in st and pg.inner_text('#poseStatus') == '已偵測到全身' else 'FAIL'),
          f"存的 AI 檔案壞掉 → 自動重新下載恢復 | {time.time()-t0:.1f}s {st} | 重新下載模型 {hits.count('model')} 次 | 偵測 {pg.inner_text('#poseStatus')} | 原本存的 {keys} | errors {errs}")
    b.close()
