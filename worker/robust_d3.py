# 背景運算的抗壓測試：故意弄壞背景執行緒，確認會自己恢復
import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8877, '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/deploy3')
UNPKG = "https://unpkg.com/@mediapipe/tasks-vision@1.0.1"
FAKE_GPU = """for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const o = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : o.call(this, p); }; }"""
LOG = """window.__st = []; setInterval(() => { const s = document.getElementById('poseStatus'); const b = document.getElementById('banner'); const v = (b && !b.hidden ? b.textContent : s ? s.textContent : '');
  if (window.__st[window.__st.length - 1] !== v) window.__st.push(v); }, 100);"""
def page(b, gpu=False, hang=None):
    pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
    global logs; logs = []
    pg.on("console", lambda m: logs.append(m.type + ':' + m.text[:120]) if m.type in ('error', 'warning') and 'W1002' not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    hung = []
    def cdn(prefix):
        def h(route):
            url = route.request.url
            if hang and hang(url): hung.append(url.split('/')[-1]); return
            f = PKG + url[len(prefix):].split("?")[0]
            route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
        return h
    pg.route(CDN + "/**", cdn(CDN)); pg.route(UNPKG + "/**", cdn(UNPKG))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480) + LOG + (FAKE_GPU if gpu else '') + "Object.defineProperty(Document.prototype, 'hidden', { get() { return !!window.__hidden; } });")
    return pg, errs, hung
def ok(name, cond, detail): print(('PASS ' if cond else 'FAIL ') + name + ' | ' + detail)
def detected(pg): return pg.inner_text('#poseStatus') == '已偵測到全身' or pg.inner_text('#hudKnee') not in ('—', '')
once = {}
def first_only(key, pred):
    def f(url):
        if pred(url) and key not in once: once[key] = 1; return True
        return False
    return f
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    sel = sys.argv[1].split(',') if len(sys.argv) > 1 else ['gpu', 'close', 'hang', 'engine', 'import', 'loader']
    if 'gpu' in sel:
        pg, errs, _ = page(b, gpu=True)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(6000)
        before = pg.inner_text('#perfBtn'); w = pg.workers[0]
        w.evaluate("gl.getExtension('WEBGL_lose_context').loseContext()")
        pg.wait_for_timeout(12000)
        ok('GPU 被收回 → 自動恢復', detected(pg) and len(pg.workers) == 1, f"前 {before} → 後 {pg.inner_text('#perfBtn')} 狀態 {pg.inner_text('#poseStatus')} 背景執行緒數 {len(pg.workers)} 過程 {pg.evaluate('window.__st')[-5:]} errors {errs}")
        # 5 秒內再壞一次 → 放棄；重開鏡頭 → 恢復
        pg.workers[0].evaluate("gl.getExtension('WEBGL_lose_context').loseContext()"); pg.wait_for_timeout(1500)
        pg.workers[-1].evaluate("gl && gl.getExtension('WEBGL_lose_context') && gl.getExtension('WEBGL_lose_context').loseContext()") if pg.workers else None
        pg.wait_for_timeout(8000)
        gave = pg.inner_text('#poseStatus')
        pg.click('#stopBtn'); pg.click('#startBtn'); pg.wait_for_timeout(12000)
        ok('連續壞掉 → 提示 → 重開鏡頭恢復', detected(pg), f"中間 {gave!r} → 重開後 {pg.inner_text('#poseStatus')} 背景執行緒數 {len(pg.workers)} errors {errs}")
        pg.close()
    if 'restarthang' in sel:
        blocked = {'on': False}
        pg, errs, hung = page(b, gpu=True, hang=lambda url: blocked['on'] and 'vision_bundle' in url)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(6000)
        blocked['on'] = True
        pg.workers[0].evaluate("gl.getExtension('WEBGL_lose_context').loseContext()"); t0 = time.time()
        pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('無法使用')", timeout=60000)
        waited = time.time() - t0
        n_workers = len(pg.workers)
        blocked['on'] = False
        pg.click('#stopBtn'); pg.click('#startBtn'); pg.wait_for_timeout(12000)
        ok('重新啟動時網路卡住 → 30 秒後提示 → 重開鏡頭恢復', 25 < waited < 40 and n_workers == 0 and detected(pg) and len(pg.workers) == 1,
           f"{waited:.1f} 秒後提示，當時背景執行緒 {n_workers} | 卡住的 {hung} | 重開後 {pg.inner_text('#poseStatus')} 背景執行緒 {len(pg.workers)} errors {errs}")
        pg.close()
    if 'sleep' in sel:
        # 手機關螢幕：AI 正在算一格時頁面切到背景，背景執行緒 7 秒沒回應，回到前景時它已經恢復 → 不應該重建
        pg, errs, _ = page(b)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(4000)
        pg.evaluate("window.__st = []")
        w0 = pg.workers[0]
        w0.evaluate("setTimeout(() => { const t = Date.now(); while (Date.now() - t < 7000); }, 0)")
        pg.evaluate("window.__hidden = true; document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(8000)
        pg.evaluate("window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(4000)
        st = pg.evaluate("window.__st")
        ok('關螢幕時 AI 暫停 → 回來不重建', detected(pg) and not any('重新啟動' in x for x in st) and pg.workers[0] is w0,
           f"過程 {st} | 同一個背景執行緒 {pg.workers[0] is w0} | errors {errs}")
        # 真的卡死（回到前景後還是沒回應）→ 回到前景約 5 秒後重建
        pg.evaluate("window.__st = []")
        w0.evaluate("setTimeout(() => { while (true); }, 0)")
        pg.evaluate("window.__hidden = true; document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(8000)
        pg.evaluate("window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))"); t0 = time.time()
        pg.wait_for_function("window.__st.some(x => x.includes('重新啟動'))", timeout=20000); found = time.time() - t0
        pg.wait_for_timeout(5000)
        ok('背景時真的卡死 → 回到前景約 5 秒後重建', 4 < found < 7.5 and detected(pg), f"回到前景後 {found:.1f} 秒發現 | {pg.inner_text('#poseStatus')} | errors {errs}")
        pg.close()
    if 'close' in sel:
        pg, errs, _ = page(b)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(4000)
        pg.workers[0].evaluate("setTimeout(() => self.close(), 10)"); t0 = time.time()
        pg.wait_for_function("window.__st.some(s => s.includes('重新啟動'))", timeout=15000); t1 = time.time()
        pg.wait_for_timeout(6000)
        ok('背景執行緒自己停掉 → 約 5 秒後發現並重建', detected(pg), f"{t1 - t0:.1f} 秒發現 → {pg.inner_text('#poseStatus')} 背景執行緒數 {len(pg.workers)} errors {errs}")
        pg.close()
    if 'hang' in sel:
        pg, errs, _ = page(b)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(4000)
        pg.workers[0].evaluate("landmarker.detectForVideo = () => { const t = Date.now(); while (Date.now() - t < 60000) {} }"); t0 = time.time()
        try:
            pg.wait_for_function("window.__st.some(s => s.includes('重新啟動'))", timeout=15000)
        except Exception:
            print('DIAG', pg.evaluate('window.__st'), pg.inner_text('#poseStatus'), pg.inner_text('#perfBtn'), len(pg.workers), errs, logs[-6:])
            raise
        t1 = time.time()
        # 卡住期間主畫面還是能按
        lag = pg.evaluate("new Promise(r => { const t = performance.now(); setTimeout(() => r(performance.now() - t), 0); })")
        pg.wait_for_timeout(7000)
        ok('背景執行緒卡死 → 主畫面照常、約 5 秒後重建', detected(pg) and lag < 50, f"{t1 - t0:.1f} 秒發現，卡住時主畫面反應 {lag:.0f} ms → {pg.inner_text('#poseStatus')} 背景執行緒數 {len(pg.workers)} errors {errs}")
        pg.close()
    for key, desc, pred in [('engine', 'AI 引擎下載沒回應', lambda u: u.endswith('.wasm')),
                            ('import', 'jsDelivr 的 MediaPipe 程式沒回應', lambda u: u.startswith(CDN) and 'vision_bundle.js' in u),
                            ('loader', 'AI 引擎啟動程式沒回應', lambda u: 'vision_wasm_internal.js' in u)]:
        if key not in sel: continue
        once.clear()
        pg, errs, hung = page(b, hang=first_only(key, pred))
        t0 = time.time(); pg.goto(base + "index.html")
        pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|請檢查網路/)", timeout=120000)
        st = pg.inner_text('#modelStatus'); el = time.time() - t0
        pg.click('#startBtn'); pg.wait_for_timeout(4000)
        ok(desc + ' → 重試成功', '已就緒' in st and detected(pg), f"{el:.0f} 秒 {st} | 卡住的：{hung} | 背景執行緒數 {len(pg.workers)} | errors {errs}")
        pg.close()
    b.close()
