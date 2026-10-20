# 10/20 晚上修正：數據面板開著時按「錄影」沒反應（控制列被藏、按鈕卻變綠框）；數據面板加「看錄製檔」
# 用法：python3 check.py [網站資料夾]（舊程式預期失敗）
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
OUT = os.path.dirname(os.path.abspath(__file__))
base = serve(8892, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{LOOP}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{LOOP}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
# 控制列看得到：不是 display:none、整個在畫面內、中間那一點最上面是控制列自己（沒被蓋住）
BAR = """() => {
  const bar = document.getElementById('recBar'), r = bar.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { visible: getComputedStyle(bar).display !== 'none' && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!hit && bar.contains(hit),
    pressed: document.getElementById('recModeBtn').getAttribute('aria-pressed'), panel: !document.getElementById('dataPanel').hidden,
    hudUp: document.getElementById('stage').classList.contains('rec-open') };
}"""
def page(b, w, h, mobile, test_mode=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    ctx.route(CDN + "/**", fake_cdn('squat_mix'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    ctx.add_init_script(cam_script(640, 480))
    if test_mode:
        ctx.add_init_script("""try { if (!sessionStorage.getItem('tmset')) { localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'A', autoDownload: false })); sessionStorage.setItem('tmset', '1'); } } catch (e) {}""")
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    pg.click('#startBtn'); pg.wait_for_timeout(1200)
    return ctx, pg, errs

sizes = [(1366, 657, False), (1280, 720, False), (1920, 940, False), (1024, 640, False), (820, 1180, True), (844, 390, True), (390, 844, True), (320, 640, True)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 各種寬度：數據面板開著／關著時按「錄影」，控制列都要出現
    for w, h, mobile in sizes:
        for panel in (False, True):
            ctx, pg, errs = page(b, w, h, mobile)
            if panel: pg.click('#dataBtn'); pg.wait_for_timeout(200)
            pg.click('#recModeBtn'); pg.wait_for_timeout(250)
            r = pg.evaluate(BAR)
            check(r['visible'] and r['pressed'] == 'true' and not r['panel'] and r['hudUp'],
                  f"{w}x{h} 數據面板{'開著' if panel else '關著'}時按「錄影」：控制列看得到、綠框、數據面板收起來 {json.dumps(r, ensure_ascii=False)}")
            check(not errs, f"{w}x{h} 沒有錯誤 {errs[:2]}")
            ctx.close()
    # 2. 來回切換（直拿手機、筆電各一次）
    for w, h, mobile in [(390, 844, True), (1366, 657, False)]:
        ctx, pg, errs = page(b, w, h, mobile)
        pg.click('#recModeBtn'); pg.wait_for_timeout(200)
        pg.click('#dataBtn'); pg.wait_for_timeout(200)
        r = pg.evaluate(BAR)
        check(not r['visible'] and r['pressed'] == 'false' and r['panel'] and not r['hudUp'], f"{w} 控制列開著時打開數據面板：控制列藏起來、綠框熄掉 {r}")
        pg.click('#dataBtn'); pg.wait_for_timeout(200)
        r = pg.evaluate(BAR)
        check(r['visible'] and r['pressed'] == 'true', f"{w} 收起數據面板：控制列回來（有記住） {r}")
        pg.click('#recModeBtn'); pg.wait_for_timeout(200)
        r = pg.evaluate(BAR)
        check(not r['visible'] and r['pressed'] == 'false', f"{w} 再按「錄影」：收起來 {r}")
        check(pg.evaluate("localStorage.getItem('recBarOpen')") == '0', f"{w} 收起來有記住")
        pg.click('#dataBtn'); pg.wait_for_timeout(200)
        pg.click('#recModeBtn'); pg.wait_for_timeout(200)
        r = pg.evaluate(BAR)
        check(r['visible'] and not r['panel'] and pg.evaluate("localStorage.getItem('recBarOpen')") == '1', f"{w} 收起來＋數據面板開著時按「錄影」：數據面板收起、控制列出現、記住打開 {r}")
        # 重新整理：記住打開；數據面板一開始是關的，控制列直接看得到
        pg.reload(); pg.wait_for_function(READY, timeout=60000); pg.click('#startBtn'); pg.wait_for_timeout(1200)
        r = pg.evaluate(BAR)
        check(r['visible'] and r['pressed'] == 'true', f"{w} 重新整理後控制列還開著 {r}")
        check(not errs, f"{w} 沒有錯誤 {errs[:2]}")
        ctx.close()
    # 3. 數據面板的「看錄製檔」
    for w, h, mobile in [(390, 844, True), (1366, 657, False), (320, 640, True)]:
        ctx, pg, errs = page(b, w, h, mobile)
        pg.click('#dataBtn'); pg.wait_for_timeout(200)
        check(not pg.is_visible('#galleryOpen'), f"{w} 還沒有錄製檔：沒有「看錄製檔」")
        pg.select_option('#countdownSelect', '0')
        pg.click('#recordBtn'); pg.wait_for_timeout(1500)
        check(pg.is_disabled('#galleryOpen') or not pg.is_visible('#galleryOpen'), f"{w} 錄製中不能打開清單")
        pg.click('#recordBtn'); pg.wait_for_timeout(1500)
        txt = pg.text_content('#galleryOpen'); saved = pg.text_content('#recordSaved')
        check(pg.is_visible('#galleryOpen') and pg.is_enabled('#galleryOpen') and txt == '看錄製檔（1）', f"{w} 錄完一段：數據面板有「看錄製檔（1）」 {txt!r}")
        check('按「看錄製檔」下載' in saved, f"{w} 存好的說明 {saved!r}")
        # 按鈕在畫面內、沒有讓數據面板左右超出
        box = pg.evaluate("""() => { const r = document.getElementById('galleryOpen').getBoundingClientRect(), p = document.getElementById('dataPanel');
            return { inView: r.left >= 0 && r.right <= innerWidth, overflow: p.scrollWidth - p.clientWidth }; }""")
        check(box['inView'] and box['overflow'] <= 1, f"{w} 「看錄製檔」在畫面內、數據面板沒有左右超出 {box}")
        pg.click('#recordBtn'); pg.wait_for_timeout(1200); pg.click('#recordBtn'); pg.wait_for_timeout(1500)
        check(pg.text_content('#galleryOpen') == '看錄製檔（2）', f"{w} 第二段：數字跟著變 {pg.text_content('#galleryOpen')!r}")
        pg.click('#galleryOpen'); pg.wait_for_timeout(500)
        g = pg.evaluate("""() => { const g = document.getElementById('galleryPanel'), r = g.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30);
            return { shown: !g.hidden && r.width > 0, onTop: !!hit && g.contains(hit), items: g.querySelectorAll('.lib-items li').length, focus: document.activeElement.id }; }""")
        check(g['shown'] and g['onTop'] and g['items'] == 2 and g['focus'] == 'galleryClose', f"{w} 按「看錄製檔」：清單在最上層、2 段、焦點在「關閉」 {g}")
        if w == 390: pg.screenshot(path=OUT + '/gallery_from_panel.png')
        with pg.expect_download() as d:
            pg.click('#galleryList .lib-items li button')
        check(d.value.suggested_filename.endswith('.json'), f"{w} 清單裡下載得到 {d.value.suggested_filename}")
        pg.click('#galleryClose'); pg.wait_for_timeout(300)
        check(pg.evaluate("document.activeElement.id") == 'galleryOpen' and pg.evaluate("document.getElementById('galleryPanel').hidden"), f"{w} 關閉：焦點回到「看錄製檔」")
        if w == 390: pg.screenshot(path=OUT + '/panel_390.png')
        # 從錄影控制列打開的，關掉回到控制列的「錄製檔」
        pg.click('#recModeBtn'); pg.wait_for_timeout(200)
        pg.click('#galleryBtn'); pg.wait_for_timeout(300); pg.click('#galleryClose'); pg.wait_for_timeout(200)
        check(pg.evaluate("document.activeElement.id") == 'galleryBtn', f"{w} 從控制列打開的，關掉回到「錄製檔」")
        check(not errs, f"{w} 沒有錯誤 {errs[:2]}")
        ctx.close()
    # 4. 實測模式：「錄影」藏起來，數據面板的「看錄製檔」照樣能用
    ctx, pg, errs = page(b, 390, 844, True, test_mode=True)
    check(not pg.is_visible('#recModeBtn') and pg.is_visible('#testBar'), "實測模式：「錄影」藏起來、實測控制列在")
    pg.click('#dataBtn'); pg.wait_for_timeout(200)
    pg.select_option('#countdownSelect', '0')
    pg.click('#recordBtn'); pg.wait_for_timeout(1500); pg.click('#recordBtn'); pg.wait_for_timeout(1500)
    pg.click('#galleryOpen'); pg.wait_for_timeout(400)
    check(pg.is_visible('#galleryPanel') and pg.locator('#galleryList .lib-items li').count() == 1, "實測模式：數據面板打得開清單")
    check(not errs, f"實測模式沒有錯誤 {errs[:2]}")
    ctx.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
