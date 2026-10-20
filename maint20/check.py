# 10/20 保養：左上角的狀態列換行變高時，下面置中的大字（入鏡提示、紅字、每一下的提示）要在它下面（js/ui/infobar-space.js）
# 用法：python3 check.py <網站資料夾> [old]   old：在舊程式上跑，預期 320 寬會失敗（確認測試抓得到問題）
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
OLD = len(sys.argv) > 2 and sys.argv[2] == 'old'
FAKE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'prCcheck')
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8841, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{FAKE}/fake_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{FAKE}/fake_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
# 每一格記下：哪個大字露出來、它的上緣，和狀態列的下緣（最差的那一格才算數）
# 規則：上緣 = max(112, 狀態列下緣 + 8)。狀態列只有一行時（下緣 ≤ 104）位置和以前一樣（112）；速度建議卡片、點開的運算標籤也在狀態列裡，大字放在它們下面
# __bad：不照規則的格子（差 1px 以上）；__single：狀態列一行時大字的上緣
WATCH = """window.__worst = {}; window.__seen = {}; window.__bad = []; window.__single = {};
  const prev = {};
  const look = () => {
    const bar = document.getElementById('infobar'); if (!bar) return;
    const b = bar.getBoundingClientRect();
    for (const id of ['banner', 'formTip', 'repToast']) {
      const el = document.getElementById(id);
      if (!el || el.hidden || !b.height) { prev[id] = false; continue; }
      const r = el.getBoundingClientRect(); if (!r.height) { prev[id] = false; continue; }
      const gap = r.top - b.bottom;
      window.__seen[id] = (window.__seen[id] || 0) + 1;
      // 這裡在畫面更新的一開始量：狀態列剛變高的那一格，網站在同一格畫出來之前才把大字移好（ResizeObserver），
      // 所以只有「連續兩格都不照規則」才算錯；最差的間距也不算那一格
      const want = Math.max(112, b.bottom + 8);
      const off = Math.abs(r.top - want) > 1;
      if (off && prev[id] && window.__bad.length < 5) window.__bad.push([id, Math.round(r.top), Math.round(b.bottom)]);
      if (!off || prev[id]) {
        if (!(id in window.__worst) || gap < window.__worst[id].gap) window.__worst[id] = { gap: Math.round(gap), top: Math.round(r.top), bar: Math.round(b.bottom), text: el.textContent.slice(0, 20) };
      }
      if (!off && b.bottom <= 104) (window.__single[id] = window.__single[id] || new Set()).add(Math.round(r.top));
      prev[id] = off;
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);"""
def fake_page(b, kind, q, vw, vh, mobile=True):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg
# 入鏡提示站好時網站會自己收起來：量 CSS 算出來的位置（藏起來時也算得出來）
TOP = "(id) => Math.round(parseFloat(getComputedStyle(document.getElementById(id)).top))"
BAR = "() => { const b = document.getElementById('infobar').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; }"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 深蹲第 2 下做錯（上身前傾）：320 寬時狀態列換兩行，紅字、每一下的提示要在下面；390、844、1280 寬位置不變（112px）
    res = {}
    for vw, vh, mob in [(320, 640, True), (360, 740, True), (390, 844, True), (844, 390, True), (1280, 800, False)]:
        ctx, pg = fake_page(b, 'squat_err', '?workout=squat', vw, vh, mob)
        pg.click("#startBtn"); pg.wait_for_timeout(11000)
        worst = pg.evaluate("window.__worst"); bar = pg.evaluate(BAR)
        res[vw] = (worst, bar)
        seen = [k for k in ('formTip', 'repToast', 'banner') if k in worst]
        need = ['formTip', 'repToast']
        check(all(k in worst for k in need), f'{vw}x{vh} 看得到紅字和每一下的提示：{seen}')
        check(all(worst[k]['gap'] >= 0 for k in seen), f'{vw}x{vh} 大字都在狀態列下面（狀態列 {bar}）：' + json.dumps({k: [worst[k]["gap"], worst[k]["top"]] for k in seen}, ensure_ascii=False))
        r = pg.evaluate("() => { const a = document.getElementById('formTip').getBoundingClientRect(); return [a.left, a.right, a.bottom, document.documentElement.scrollWidth]; }")
        check(r[0] >= 0 and r[1] <= vw and r[2] <= vh and r[3] == vw, f'{vw}x{vh} 紅字在畫面內 {[round(x) for x in r]}')
        bad = pg.evaluate("window.__bad")
        single = pg.evaluate("Object.fromEntries(Object.entries(window.__single).map(([k, v]) => [k, [...v]]))")
        check(not bad, f'{vw}x{vh} 每一格都照規則（上緣 = max(112, 狀態列下緣 + 8)）' + (f'：不照規則 {bad}' if bad else ''))
        if vw != 320:
            check(single and all(v == [112] for v in single.values()), f'{vw}x{vh} 狀態列一行時大字還在原來的位置（112px）：{single}')
        check(not pg.errs, f'{vw}x{vh} 沒有錯誤 ' + str(pg.errs[:2]))
        pg.screenshot(path=f"{HERE}/{'old' if OLD else 'new'}_{vw}x{vh}.png")
        ctx.close()
    # 2. 點開運算標籤（多出每秒格數、AI 模型兩個選單，狀態列變高）：入鏡提示要跟著往下；收起來時回到原位
    for vw, vh in [(390, 844), (320, 640)]:
        ctx, pg = fake_page(b, 'squat_err', '?workout=squat', vw, vh)
        pg.click("#startBtn"); pg.wait_for_function("!document.getElementById('perfBtn').hidden", timeout=15000)
        pg.wait_for_timeout(500)
        # 入鏡提示的位置（CSS 算出來的，藏起來時也量得到）和狀態列的下緣，同一刻量
        M = "() => { const b = document.getElementById('infobar').getBoundingClientRect(); return [Math.round(parseFloat(getComputedStyle(document.getElementById('banner')).top)), Math.round(b.bottom)]; }"
        before, bar0 = pg.evaluate(M)
        pg.click("#perfBtn"); pg.wait_for_timeout(400)
        opened, bar1 = pg.evaluate(M)
        check(bar1 > bar0 and opened == max(112, bar1 + 8), f'{vw} 寬點開運算標籤：狀態列下緣 {bar0}→{bar1}，入鏡提示 {before}→{opened}')
        pg.click("#perfBtn"); pg.wait_for_timeout(400)
        closed, bar2 = pg.evaluate(M)
        check(closed == before and bar2 == bar0, f'{vw} 寬收起來回到原位：{closed}（原本 {before}）')
        # 光線提醒出現（字很多，換好幾行）：也要往下推（網站每秒量一次亮度，量之前先量好）
        light, bar3 = pg.evaluate("() => { document.getElementById('lightNote').hidden = false; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r((" + M + ")())))); }")
        check(bar3 > bar0 and light == max(112, bar3 + 8), f'{vw} 寬光線提醒出現時：狀態列下緣 {bar3}，入鏡提示 {light}')
        # 入鏡提示叫出來拍照看
        pg.evaluate("() => { const el = document.getElementById('banner'); el.textContent = '請往後退'; el.hidden = false; document.getElementById('lightNote').hidden = false; }")
        pg.screenshot(path=f"{HERE}/{'old' if OLD else 'new'}_light_{vw}.png")
        check(not pg.errs, f'{vw} 寬沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()
    # 3. 關鏡頭再開：位置還是對的（狀態列重新量）
    ctx, pg = fake_page(b, 'squat_err', '?workout=squat', 320, 640)
    pg.click("#startBtn"); pg.wait_for_timeout(3000); pg.click("#stopBtn"); pg.wait_for_timeout(800)
    pg.evaluate("window.__worst = {}")
    pg.click("#startBtn"); pg.wait_for_timeout(11000)
    worst = pg.evaluate("window.__worst")
    check(worst and all(v['gap'] >= 0 for v in worst.values()), '320 寬關鏡頭再開：' + json.dumps({k: v['gap'] for k, v in worst.items()}, ensure_ascii=False))
    check(not pg.errs, '關鏡頭再開沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
