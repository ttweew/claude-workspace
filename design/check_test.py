import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8907, '/home/user/claude-workspace')
NOGL2 = """for (const C of [HTMLCanvasElement, typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : null]) { if (!C) continue;
  const o = C.prototype.getContext; C.prototype.getContext = function (t, ...a) { return /webgl2/.test(t) ? null : o.call(this, t, ...a); }; }"""
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
IPHONE_OLD = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
LINE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.20.0'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, ua, nogl in [('電腦（測試用瀏覽器）', None, False), ('iPhone iOS 17.5', IPHONE, False), ('iPhone iOS 14（沒有 WebGL2）', IPHONE_OLD, True), ('iPhone LINE', LINE, False)]:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, user_agent=ua, device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base.rstrip('/'))
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        if nogl: pg.add_init_script(NOGL2)
        pg.goto(base + "help.html"); pg.click('#checkBtn'); pg.click('#copyBtn'); pg.wait_for_timeout(300)
        copied = pg.evaluate("navigator.clipboard.readText().catch(() => '')")
        print(f"[{name}] {pg.inner_text('#checkVerdict')} | 建議：{pg.inner_text('#checkAdvice') if pg.is_visible('#checkAdvice') else '—'} | {pg.inner_text('#copyStatus')} | 複製了 {len(copied.splitlines())} 行 | errors {errs}")
        if name.startswith('iPhone iOS 14'): pg.locator('#check').screenshot(path='after/check_nogl.png')
        if name.startswith('電腦'): pg.locator('#check').screenshot(path='after/check_ok.png'); print(copied)
        ctx.close()
    # 首頁：沒有 WebGL2 → 馬上說明、不重試、鏡頭仍可開
    ctx = b.new_context(viewport={"width": 390, "height": 844}, user_agent=IPHONE_OLD); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:100])); mock_network(pg); pg.add_init_script(cam_script(640, 480) + NOGL2)
    t0 = time.time(); pg.goto(base + "index.html")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('無法執行 AI')", timeout=30000)
    el = time.time() - t0; pg.wait_for_timeout(8000)
    st = pg.inner_text('#modelStatus')
    pg.click('#startBtn'); pg.wait_for_timeout(2000)
    print(f"[首頁沒有 WebGL2] {el:.1f} 秒就說明 | 8 秒後仍是：{st} | 開鏡頭：{pg.is_visible('#stage')} {pg.inner_text('#poseStatus')} | errors {errs}")
    b.close()
