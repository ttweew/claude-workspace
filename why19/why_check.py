# 10/19 提案：錯誤說出原因（假鏡頭＋假 AI 的伏地挺身，會塌腰、屁股太高）
#  1. 運動中：紅字下面一行小字「腰往下彎 18°，超過 16° 算塌腰」；同一次紅字裡數字只會變大（取最嚴重）；螢幕閱讀器不唸（aria-hidden）
#  2. 做完：總結有「最嚴重的一下：…」，數字和每一下記的一樣
#  3. 錄下來丟進重播分析：表格的錯誤後面寫數字（例如「塌腰 18°」），總結也寫原因
#  4. 舊的紀錄（沒有 peaks）、被改過的 peaks：首頁的總結和紀錄照常、沒有程式錯誤
# 用法：python3 why_check.py <網站資料夾>
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
OUT = os.path.dirname(os.path.abspath(__file__))
base = serve(8875, ROOT)
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
SPY = """Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });"""
WHY = re.compile(r'^(腰往下彎|屁股往上翹) (\d+)°，超過 (16|20)° 算(塌腰|屁股太高)$')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    errs = []
    ctx.route(CDN + "/**", fake_cdn('pushup_err'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(SPY)
    ctx.add_init_script("try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + 'index.html?workout=pushup'); pg.wait_for_function(READY, timeout=60000)

    # 1. 運動中：每 100 毫秒看一次紅字和原因
    pg.click('#startBtn'); pg.wait_for_selector('#stage:not([hidden])')
    pg.evaluate("""() => { window.__why = []; setInterval(() => {
        const tip = document.getElementById('formTip'), why = document.getElementById('formWhy');
        if (!tip.hidden) window.__why.push([document.getElementById('formTipText').textContent, why.hidden ? '' : why.textContent]);
    }, 100); }""")
    pg.wait_for_timeout(14000)
    samples = pg.evaluate("window.__why")
    shown = [s for s in samples if s[1]]
    check(len(shown) >= 5 and all(WHY.match(w) for _, w in shown), f'紅字下面說出原因（{len(shown)} 次）：{shown[:1]} … {shown[-1:]}')
    # 同一段紅字（連續同一種錯誤）裡，數字只會變大
    mono = True
    for (t1, w1), (t2, w2) in zip(samples, samples[1:]):
        m1, m2 = WHY.match(w1), WHY.match(w2)
        if m1 and m2 and m1.group(1) == m2.group(1) and t1 == t2 and int(m2.group(2)) < int(m1.group(2)): mono = False
    check(mono, '同一次紅字裡數字只會變大（取最嚴重，不會一直跳）')
    check(pg.evaluate("document.getElementById('formWhy').getAttribute('aria-hidden')") == 'true' and pg.evaluate("document.getElementById('formTip').getAttribute('role')") == 'status',
          '原因的小字不給螢幕閱讀器唸（數字一直變），紅字照樣會唸')
    pg.locator('#stage').screenshot(path=f'{OUT}/live.png')

    # 錄一段：數據面板 → 開始錄製（不倒數）→ 10 秒 → 停止 → 下載 JSON
    pg.click('#dataBtn'); pg.wait_for_timeout(300)
    pg.click('#recordBtn'); pg.wait_for_timeout(10000); pg.click('#recordBtn'); pg.wait_for_timeout(800)
    with pg.expect_download() as d:
        pg.click('#jsonBtn')
    path = OUT + '/rec.json'; d.value.save_as(path)
    pg.click('#dataBtn'); pg.wait_for_timeout(300)
    pg.click('#stopBtn'); pg.wait_for_timeout(1000)

    # 2. 總結
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    reasons = [l for l in lines if l.startswith('最嚴重的一下：')]
    hist = pg.evaluate("JSON.parse(localStorage.getItem('workoutHistory') || '[]')")
    last = hist[-1] if hist else {}
    good = bool(reasons) and all(WHY.match(l[len('最嚴重的一下：'):]) for l in reasons) and set(last.get('peaks', {})) <= set(last.get('errors', {})) and last.get('peaks')
    check(good, f'總結寫出最嚴重的一下：{reasons}；紀錄 peaks {last.get("peaks")} errors {last.get("errors")}')
    for l in reasons:
        m = WHY.match(l[len('最嚴重的一下：'):])
        key = 'sag' if m.group(1) == '腰往下彎' else 'pike'
        check(int(m.group(2)) == last['peaks'][key], f'總結的數字和紀錄一樣：{m.group(2)} = {last["peaks"][key]}')
    pg.locator('#summary').screenshot(path=f'{OUT}/summary.png')
    check(not errs, '沒有程式錯誤 ' + str(errs[:2]))

    # 3. 重播分析
    rp = ctx.new_page(); rerrs = []
    rp.on("pageerror", lambda e: rerrs.append(str(e)))
    rp.goto(base + 'replay.html'); rp.wait_for_timeout(1000)
    rp.set_input_files('#fileInput', path)
    rp.wait_for_function("document.querySelectorAll('td.has-errors').length > 0 || document.querySelectorAll('tbody tr').length > 0", timeout=60000)
    rp.wait_for_timeout(1500)
    cells = rp.evaluate("[...document.querySelectorAll('td.has-errors')].map(td => td.textContent)")
    check(cells and all(re.fullmatch(r'((塌腰|屁股太高) \d+°)(、(塌腰|屁股太高) \d+°)*', c) for c in cells), f'重播分析的表格：錯誤後面寫數字 {cells[:3]}')
    summ = rp.evaluate("(document.querySelector('#squatSummary') || {}).textContent || ''")
    check('最嚴重的一下：' in summ, '重播分析的總結也寫出原因：' + summ[-60:])
    check(not rerrs, '重播分析沒有程式錯誤 ' + str(rerrs[:2]))
    rp.close()

    # 4. 舊紀錄、被改過的 peaks
    old = {"workout": "squat", "date": 1792300000000, "minutes": 2, "count": 3, "clean": 1, "errors": {"lean": 2},
           "good": 1, "close": 1, "shallow": 1, "best": 85, "average": 102, "tempo": 2.4, "similarity": 90}
    bad = [dict(old, date=old['date'] + 1), dict(old, date=old['date'] + 2, peaks={"lean": "62"}), dict(old, date=old['date'] + 3, peaks=[1, 2]),
           dict(old, date=old['date'] + 4, peaks={"__proto__": {"lean": 1}, "constructor": 5})]
    pg.evaluate("h => localStorage.setItem('workoutHistory', JSON.stringify(h))", bad)
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    n = pg.evaluate("document.querySelectorAll('#historyList li').length")
    check(n == 4 and not errs, f'舊的、被改過 peaks 的紀錄：運動紀錄照常列出 {n} 筆、沒有程式錯誤 {errs[:1]}')
    pg.click('#startBtn'); pg.wait_for_timeout(9000); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    check(lines and not errs, f'接著做一組：總結照常、和上一次比較 {lines[-1:]}')
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
