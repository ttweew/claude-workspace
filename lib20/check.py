# 10/20 晚上：錄影像手機一樣（js/ui/rec-bar.js）＋錄製檔清單（js/data/library.js、js/ui/library-list.js、js/data/zip.js）
#  1. 工具列「錄影」打開下方的錄影控制列、會記住；實測模式時藏起來
#  2. 大圓鈕開始 → 錄製中（方塊、時間在跑、暫停鍵）→ 暫停（不錄、時間停）→ 繼續 → 結束：自動存成一段；再按就是新的一段
#  3. 倒數設定和數據面板同一個；倒數中按大圓鈕取消
#  4. 錄製檔清單（鏡頭畫面、首頁）：新的在前面、一段一段下載、勾選的一次下載、壓縮成 zip（Python 檢查）、刪除、重新整理還在
#  5. 下載的檔案：meta.pauses、暫停的地方時間空一段
#  6. 重播分析：列出手機裡的錄製檔，按「分析」直接打開
#  7. 實測模式：預設只存不下載（「✓ 已存好」）、暫停；清單上寫受測者和這組要做的
#  8. 這個瀏覽器不能存（沒有 IndexedDB）：數據面板照舊「重新錄製」、實測的一組直接下載
#  9. 版面：320／390／844 橫拿／1280，錄影控制列在畫面內、不蓋大字儀表板；清單在最上層；axe-core 0 個問題
# 用法：python3 check.py [網站資料夾]
import sys, os, re, json, zipfile, io
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
OUT = os.path.dirname(os.path.abspath(__file__))
AXE = S + '/a11y/node_modules/axe-core/axe.min.js'
base = serve(8895, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
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
QUIET = """(() => {
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
})();"""
# within：只檢查這一塊（首頁、重播頁在手機寬度本來就有 2 個問題：左上角網站名稱連結沒有文字、重播曲線的切換按鈕對比不夠，10/21 保養修）
def axe(pg, label, within=None):
    pg.add_script_tag(path=AXE)
    res = pg.evaluate("""async (within) => { const r = await axe.run(within ? document.querySelector(within) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ')) })); }""", within)
    for v in res: print(f"    - {v['id']}（{v['impact']}，{v['n']} 處）{v['help']}：{v['targets']}")
    check(not res, f'axe {label}：{len(res)} 種問題')
REC = """() => { const q = s => document.querySelector(s); const vis = e => e && !e.hidden && e.getClientRects().length > 0;
  return { bar: vis(q('#recBar')), state: q('#recMain').dataset.state, clock: vis(q('#recClock')) ? q('#recClock').textContent : '', pause: vis(q('#recPause')),
    count: q('#galleryCount').textContent, note: q('#recNote').textContent, galleryOff: q('#galleryBtn').disabled, info: q('#recordInfo').textContent,
    btn: q('#recordBtn').textContent, saved: q('#recordSaved').textContent, data: q('#dataBtn').textContent.trim() }; }"""
ITEMS = "(sel) => [...document.querySelectorAll(sel + ' .lib-items li')].map(li => [li.querySelector('strong').textContent, li.querySelector('small').textContent])"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def context(kind='squat_mix', init=None, vw=390, vh=844, mobile=True):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, accept_downloads=True, is_mobile=mobile, has_touch=mobile)
        ctx.route(CDN + "/**", fake_cdn(kind))
        ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(QUIET)
        if init: ctx.add_init_script(init)
        return ctx
    def page(ctx, q='?workout=squat'):
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
        return pg
    def wait_count(pg, n):
        pg.wait_for_function(f"document.getElementById('galleryCount').textContent === '{n}'", timeout=10000)

    # ---------- 1～5. 一般的錄影 ----------
    ctx = context()
    pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_timeout(1200)
    st = pg.evaluate(REC)
    check(not st['bar'] and pg.get_attribute('#recModeBtn', 'aria-pressed') == 'false', '錄影控制列預設收起來')
    pg.click('#recModeBtn'); pg.wait_for_timeout(200)
    st = pg.evaluate(REC)
    check(st['bar'] and st['state'] == 'idle' and not st['pause'] and st['count'] == '0' and pg.get_attribute('#recModeBtn', 'aria-pressed') == 'true',
          f"按「錄影」打開：大圓鈕、錄製檔 {st['count']}、還沒有暫停鍵")
    axe(pg, '鏡頭畫面（錄影控制列，還沒錄）')
    # 倒數：和數據面板同一個設定；倒數中按大圓鈕取消
    pg.select_option('#recTimer', '3')
    check(pg.input_value('#countdownSelect') == '3' and pg.evaluate("localStorage.getItem('recordCountdown')") == '3', '倒數設定和數據面板同一個、會記住')
    pg.click('#recMain'); pg.wait_for_timeout(400)
    st = pg.evaluate(REC)
    check(st['state'] == 'counting' and pg.is_visible('#countdown') and pg.get_attribute('#recMain', 'aria-label') == '取消倒數', '倒數中：大圓鈕變成取消')
    pg.click('#recMain'); pg.wait_for_timeout(1500)
    st = pg.evaluate(REC)
    check(st['state'] == 'idle' and not pg.is_visible('#countdown') and st['count'] == '0' and '錄製中' not in st['info'], '倒數中取消：沒有開始錄')
    pg.select_option('#recTimer', '0')
    # 開始 → 暫停 → 繼續 → 結束
    pg.click('#recMain'); pg.wait_for_timeout(2200)
    st = pg.evaluate(REC)
    check(st['state'] == 'recording' and st['clock'].startswith('● 0:0') and st['pause'] and st['galleryOff'] and st['data'].endswith('●') and pg.get_attribute('#recMain', 'aria-label') == '結束錄影',
          f"錄製中：{st['clock']}、暫停鍵、錄製檔不能點、數據按鈕 {st['data']}")
    axe(pg, '鏡頭畫面（錄影中）')
    pg.click('#recPause'); pg.wait_for_timeout(300)
    a = pg.evaluate(REC); pg.wait_for_timeout(1500); b2 = pg.evaluate(REC)
    frames = lambda s: int(re.search(r'(\d+) 格', s['info']).group(1))
    check(a['state'] == 'paused' and a['clock'].startswith('❚❚') and a['clock'] == b2['clock'] and frames(a) == frames(b2) and a['info'].startswith('暫停中')
          and pg.get_attribute('#recPause', 'aria-label') == '繼續錄影' and b2['data'].endswith('❚❚'),
          f"暫停中：時間停在 {b2['clock']}、格數不變 {frames(a)}→{frames(b2)}、{b2['info']}")
    pg.click('#recPause'); pg.wait_for_timeout(1500)
    c = pg.evaluate(REC)
    check(c['state'] == 'recording' and frames(c) > frames(b2), f"繼續：又開始錄 {frames(b2)}→{frames(c)} 格")
    pg.click('#recMain'); wait_count(pg, 1)
    st = pg.evaluate(REC)
    check(st['state'] == 'idle' and st['note'].startswith('已存好第 1 段') and st['btn'] == '● 錄下一段' and st['saved'].startswith('已存進錄製檔（共 1 段') and not st['galleryOff'],
          f"結束：{st['note']}、數據面板 {st['btn']}、{st['saved']}")
    pg.click('#recMain'); pg.wait_for_timeout(1500); pg.click('#recMain'); wait_count(pg, 2)
    check(pg.evaluate(REC)['note'].startswith('已存好第 2 段'), '再按一次就是新的一段，不會蓋掉上一段')
    pg.reload(); pg.wait_for_function(READY, timeout=60000); pg.click('#startBtn'); pg.wait_for_timeout(1000)
    st = pg.evaluate(REC)
    check(st['bar'] and st['count'] == '2', f"重新整理：錄影控制列還開著、錄製檔還有 {st['count']} 段")
    # 錄製檔清單（鏡頭畫面）
    pg.click('#galleryBtn'); pg.wait_for_timeout(500)
    items = pg.evaluate(ITEMS, '#galleryList')
    focus = pg.evaluate("document.activeElement.id")
    check(len(items) == 2 and all(t == '深蹲' for t, _ in items) and focus == 'galleryClose', f'鏡頭畫面的錄製檔：{items}，焦點在「關閉」')
    top = pg.evaluate("document.elementFromPoint(innerWidth / 2, document.getElementById('galleryTitle').getBoundingClientRect().top + 5).closest('#galleryPanel') !== null")
    check(top, '清單在最上層（標題沒有被狀態列蓋住）')
    axe(pg, '鏡頭畫面（錄製檔清單）')
    pg.screenshot(path=f'{OUT}/gallery_390.png')
    check(pg.is_disabled('#galleryList .lib-zip') and pg.inner_text('#galleryList .lib-picked') == '勾選要下載的段落', '還沒勾選：按鈕不能按')
    # 一段一段下載
    with pg.expect_download() as d1:
        pg.click('#galleryList .lib-items li:nth-child(2) button')
    one = json.load(open(d1.value.path(), encoding='utf-8'))
    pauses = one['meta'].get('pauses')
    gaps = [b3['t'] - a3['t'] for a3, b3 in zip(one['frames'], one['frames'][1:])]
    check(re.match(r'^pose_\d{8}_\d{6}\.json$', d1.value.suggested_filename) and pauses and len(pauses) == 1 and 1500 <= pauses[0]['to'] - pauses[0]['from'] <= 2500
          and max(gaps) >= 1500, f"下載第一段：{d1.value.suggested_filename}，暫停 {pauses}，最長間隔 {max(gaps)} 毫秒")
    pg.wait_for_timeout(300)
    items = pg.evaluate(ITEMS, '#galleryList')
    check(items[1][1].endswith('已下載') and not items[0][1].endswith('已下載'), '下載過的標「已下載」')
    # 勾選全部：一次下載（兩個檔案）、壓縮成 zip
    pg.check('#galleryList .lib-all')
    check(pg.inner_text('#galleryList .lib-picked').startswith('選了 2 段'), '全選：' + pg.inner_text('#galleryList .lib-picked'))
    got = []
    pg.on('download', lambda d: got.append(d))
    pg.click('#galleryList .lib-each'); pg.wait_for_timeout(2000)
    check(len(got) == 2 and all(d.suggested_filename.endswith('.json') for d in got), '勾選的一次下載：' + str([d.suggested_filename for d in got]))
    got.clear()
    pg.click('#galleryList .lib-zip'); pg.wait_for_function("document.querySelector('#galleryList .lib-status').textContent.startsWith('已下載 zip')", timeout=15000)
    pg.wait_for_timeout(500)
    zf = zipfile.ZipFile(got[0].path()) if got else None
    names = zf.namelist() if zf else []
    check(zf and zf.testzip() is None and len(names) == 2 and all(json.loads(zf.read(n))['meta']['workout'] == 'squat' for n in names) and got[0].suggested_filename.endswith('.zip'),
          f"壓縮成 zip：{got[0].suggested_filename if got else None}，裡面 {names}，{pg.inner_text('#galleryList .lib-status')}")
    # 刪除（會問）
    pg.uncheck('#galleryList .lib-all'); pg.check('#galleryList .lib-items li:nth-child(1) input')
    pg.click('#galleryList .lib-delete'); wait_count(pg, 1)
    check(len(pg.evaluate(ITEMS, '#galleryList')) == 1, '刪除勾選的一段：剩 1 段')
    pg.click('#galleryClose'); pg.wait_for_timeout(200)
    check(not pg.is_visible('#galleryPanel') and pg.evaluate("document.activeElement.id") == 'galleryBtn', '關閉清單：焦點回到「錄製檔」')
    # 首頁的錄製檔
    pg.click('#stopBtn'); pg.wait_for_timeout(800)
    summ = pg.inner_text('#librarySummary')
    pg.click('#librarySummary'); pg.wait_for_timeout(300)
    check(pg.is_visible('#libraryBox') and summ.startswith('錄製檔（1 段') and len(pg.evaluate(ITEMS, '#homeLibrary')) == 1, '首頁：' + summ)
    axe(pg, '首頁的錄製檔', '#libraryBox')
    pg.set_viewport_size({"width": 320, "height": 640}); pg.wait_for_timeout(200)
    check(pg.evaluate("document.documentElement.scrollWidth") == 320, '首頁 320 寬沒有左右捲動')
    pg.screenshot(path=f'{OUT}/home_320.png', full_page=True)
    # 重播分析：直接打開手機裡的錄製檔
    rp = ctx.new_page(); rp.errs = []
    rp.on("pageerror", lambda e: rp.errs.append(str(e)))
    rp.goto(base + 'replay.html'); rp.wait_for_selector('#phoneFiles:not([hidden])', timeout=10000)
    rp.click('#phoneList button'); rp.wait_for_function("document.getElementById('summary').textContent.includes('長度')", timeout=60000)
    check('長度' in rp.inner_text('#summary') and not rp.errs, '重播分析：按「分析」直接打開手機裡的錄製檔 ' + rp.inner_text('#loadStatus')[:40])
    axe(rp, '重播分析的「這支手機裡的錄製檔」', '#phoneFiles')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()

    # ---------- 7. 實測模式：預設只存不下載、暫停 ----------
    ctx = context(init="localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'C' })); localStorage.setItem('recordCountdown', '0');")
    pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_timeout(1500)
    check(not pg.is_visible('#recModeBtn') and not pg.is_visible('#recBar'), '實測模式：「錄影」藏起來（用實測控制列）')
    got = []
    pg.on('download', lambda d: got.append(d))
    pg.click('#testPicks button[data-condition="good"]'); pg.wait_for_timeout(2500)
    pg.click('#testPause'); pg.wait_for_timeout(300)
    stp = pg.text_content('#testState'); lab = pg.text_content('#testPause')
    pg.wait_for_timeout(1500); pg.click('#testPause'); pg.wait_for_timeout(1500)
    pg.click('#testAction'); pg.wait_for_function("document.getElementById('testState').textContent.startsWith('✓')", timeout=10000)
    st = pg.text_content('#testState')
    check(stp.startswith('❚❚ 暫停中：做對 10 下') and lab == '▶ 繼續', f'實測的一組可以暫停：{stp}／{lab}')
    check(st.startswith('✓ 已存好：做對 10 下（網站算') and not got, f'預設只存不下載：{st}，下載 {len(got)} 個')
    pg.click('#stopBtn'); pg.wait_for_timeout(800); pg.click('#librarySummary'); pg.wait_for_timeout(300)
    items = pg.evaluate(ITEMS, '#homeLibrary')
    check(items and items[0][0] == '深蹲 · 受測者 C · 做對 10 下', '清單上寫受測者和這組要做的：' + str(items[:1]))
    with pg.expect_download() as d2:
        pg.click('#homeLibrary .lib-items li:nth-child(1) button')
    m = json.load(open(d2.value.path(), encoding='utf-8'))['meta']
    check(d2.value.suggested_filename.startswith('test_C_squat_good_') and m['test'] == {'subject': 'C', 'condition': 'good', 'reps': 10} and len(m.get('pauses', [])) == 1,
          f"下載的檔名和內容：{d2.value.suggested_filename}，{m['test']}，暫停 {len(m.get('pauses', []))} 次")
    check(not pg.errs, '實測沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()

    # ---------- 8. 不能存（沒有 IndexedDB）：照舊 ----------
    NODB = "Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });"
    ctx = context(init=NODB + "localStorage.setItem('recordCountdown', '0');")
    pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_timeout(1200)
    pg.click('#recModeBtn'); pg.click('#recMain'); pg.wait_for_timeout(1500); pg.click('#recMain'); pg.wait_for_timeout(1500)
    st = pg.evaluate(REC)
    check(st['btn'] == '● 重新錄製' and '不能存錄製檔' in st['saved'] and st['count'] == '0', f"不能存：{st['btn']}、{st['saved']}")
    check(not pg.errs, '不能存也沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    ctx = context(init=NODB + "localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'D' })); localStorage.setItem('recordCountdown', '0');")
    pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_timeout(1200)
    pg.click('#testPicks button[data-condition="good"]'); pg.wait_for_timeout(1500)
    with pg.expect_download() as d3:
        pg.click('#testAction')
    pg.wait_for_function("document.getElementById('testState').textContent.startsWith('✓')", timeout=10000)
    check(d3.value.suggested_filename.startswith('test_D_squat_good_') and pg.text_content('#testState').startswith('✓ 已下載：'), '不能存時實測的一組直接下載：' + pg.text_content('#testState'))
    ctx.close()

    # ---------- 9. 版面 ----------
    overlap = lambda a, c: a and c and a[0] < c[2] - 1 and c[0] < a[2] - 1 and a[1] < c[3] - 1 and c[1] < a[3] - 1
    LAYOUT = """() => { const r = s => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      return { bar: r('#recBar'), hud: [...document.querySelectorAll('.hud-side')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }),
        reps: r('#hudRepsBox'), toolbar: r('#toolbar'), sw: document.documentElement.scrollWidth }; }"""
    for vw, vh, mob in [(320, 640, True), (390, 844, True), (844, 390, True), (1280, 800, False)]:
        ctx = context(init="localStorage.setItem('recordCountdown', '0'); localStorage.setItem('recBarOpen', '1');", vw=vw, vh=vh, mobile=mob)
        pg = page(ctx)
        pg.click('#startBtn'); pg.wait_for_timeout(1500)
        for state in ['還沒錄', '錄影中']:
            if state == '錄影中': pg.click('#recMain'); pg.wait_for_timeout(1200)
            L = pg.evaluate(LAYOUT); c = L['bar']
            good = c and c[0] >= 0 and c[2] <= vw + 0.5 and c[3] <= vh + 0.5 and L['sw'] == vw and not overlap(c, L['toolbar']) and not any(overlap(c, h) for h in L['hud']) and not overlap(c, L['reps'])
            check(good, f'{vw}x{vh} {state}：錄影控制列 {[round(x) for x in c] if c else c} 在畫面內、不蓋大字儀表板')
        pg.screenshot(path=f'{OUT}/bar_{vw}x{vh}.png')
        pg.click('#recMain'); pg.wait_for_timeout(500)
        check(not pg.errs, f'{vw}x{vh} 沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
