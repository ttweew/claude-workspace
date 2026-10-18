import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(int(sys.argv[2]) if len(sys.argv) > 2 else 8874, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
REAL_JS = open(PKG + '/vision_bundle.js', encoding='utf-8').read()
WRAP_MJS = """export * from './vision_bundle_real.mjs';
import { PoseLandmarker } from './vision_bundle_real.mjs';
const o = PoseLandmarker.prototype.detectForVideo;
PoseLandmarker.prototype.detectForVideo = function (...a) { if (self.__throw) throw new Error('模擬偵測出錯'); return o.apply(this, a); };"""
THROW_JS = REAL_JS + """
;(() => { const o = self.Vision.PoseLandmarker.prototype.detectForVideo;
self.Vision.PoseLandmarker.prototype.detectForVideo = function (...a) { if (self.__throw) throw new Error('模擬偵測出錯'); return o.apply(this, a); }; })();"""
def cdn_with(extra):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        if rel in extra: return extra[rel](route)
        f = PKG + rel
        route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    return h
H = {"Access-Control-Allow-Origin": "*"}
def ok(name, cond, detail): print(('PASS ' if cond else 'FAIL ') + name + ' | ' + detail, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    # 1. MediaPipe 全部下載失敗：重試完之後不能留下背景執行緒
    pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
    pg.route(CDN + "/**", cdn_with({'/vision_bundle.js': lambda r: r.fulfill(status=404, body='x', headers=H)}))
    pg.route("https://unpkg.com/**", lambda r: r.fulfill(status=404, body='x', headers=H))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers=H))
    pg.goto(base + "index.html")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('請檢查網路')", timeout=60000)
    pg.wait_for_timeout(3000)
    ok('下載全部失敗後不留下背景執行緒、失敗訊息不被蓋掉', len(pg.workers) == 0 and '請檢查網路' in pg.inner_text('#modelStatus'), f"背景執行緒數 {len(pg.workers)}（重試 3 次）| {pg.inner_text('#modelStatus')} | errors {errs}")
    pg.close()
    # 2. 偵測一直出錯 → 自動重新啟動（兩種模式）
    for mode in ['main', 'worker']:
        pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        pg.route(CDN + "/**", cdn_with({
            '/vision_bundle.mjs': lambda r: r.fulfill(body=WRAP_MJS, content_type='text/javascript', headers=H),
            '/vision_bundle_real.mjs': lambda r: r.fulfill(path=PKG + '/vision_bundle.mjs', content_type='text/javascript', headers=H),
            '/vision_bundle.js': lambda r: r.fulfill(body=THROW_JS, content_type='text/javascript', headers=H)}))
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers=H))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480) + "window.__st = []; setInterval(() => { const s = document.getElementById('poseStatus'); if (s && window.__st[window.__st.length-1] !== s.textContent) window.__st.push(s.textContent); }, 50);")
        pg.goto(base + "index.html" + ('?worker=0' if mode == 'main' else '')); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_timeout(3000)
        if mode == 'main': pg.evaluate("self.__throw = true")
        else: pg.workers[0].evaluate("self.__throw = true")
        try:
            pg.wait_for_function("window.__st.some(s => s.includes('重新啟動'))", timeout=8000); restarted = True
        except Exception: restarted = False
        if mode == 'main': pg.evaluate("self.__throw = false")
        pg.wait_for_timeout(6000)
        ok(f'偵測一直出錯 → 自動重新啟動（{mode}）', restarted and pg.inner_text('#poseStatus') == '已偵測到全身', f"重新啟動 {restarted} | 最後 {pg.inner_text('#poseStatus')} | 過程 {pg.evaluate('window.__st')[-4:]} | errors {errs}")
        pg.close()
    # 3. 重播分析的背景執行緒當掉（分析時／讀檔時）→ 自動改在主畫面算完，不用重選
    src = open('/home/user/claude-workspace/js/data/replay-worker.js', encoding='utf-8').read()
    for when in ['analyze', 'load']:
        pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        crash = src.replace("if (m.type === '%s') {" % when, "if (m.type === '%s') { setTimeout(() => { throw new Error('模擬背景當掉'); }, 0); return;" % when)
        assert crash != src
        pg.route("**/js/data/replay-worker.js*", (lambda c: lambda r: r.fulfill(body=c, content_type="text/javascript"))(crash))
        pg.goto(base + "replay.html"); pg.click('#demoSide'); pg.wait_for_timeout(2000)
        first = pg.inner_text('#loadStatus')
        pg.select_option('#aspect', index=1) if pg.is_visible('#aspect') else None
        pg.click('#demoFront'); pg.wait_for_timeout(2000)
        second = pg.inner_text('#loadStatus')
        ok(f'重播背景當掉（{when}）→ 自動改在主畫面算完', '已讀取' in first and '已讀取' in second, f"第一次：{first} | 第二次：{second} | errors {errs}")
        pg.close()
    b.close()
