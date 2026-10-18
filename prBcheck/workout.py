# 運動模式（js/analysis/workouts.js）：從鏡頭畫面端到端（假的 AI 播放示範動畫做成的動作）＋介面
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8823, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
WATCH = """window.__toasts = []; window.__reps = []; window.__status = [];
  new MutationObserver(() => {
    const t = document.getElementById('repToast'); const tt = t && (t.textContent + ' [' + t.className + ']');
    if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== tt) window.__toasts.push(tt);
    const r = document.getElementById('hudReps'); if (r && window.__reps[window.__reps.length - 1] !== r.textContent) window.__reps.push(r.textContent);
    const s = document.getElementById('poseStatus'); if (s && window.__status[window.__status.length - 1] !== s.textContent) window.__status.push(s.textContent);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });"""
def fake_page(b, kind, q, vw=1280, vh=800, mobile=False):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 端到端：伏地挺身 4 下（第 3 下只下去一半）、弓箭步 3 下（第 3 下淺）、棒式撐住→翹屁股暫停→再撐→起身結束
    for worker in ['', '&worker=0']:
        tag = '（主畫面）' if worker else ''
        for kind, secs, want_reps, want_kinds in [('pushup', 15, '4', ['good', 'good', 'shallow', 'good']), ('lunge', 12, '3', ['good', 'good', 'shallow'])]:
            ctx, pg = fake_page(b, kind, '?workout=' + kind + worker)
            pg.click("#startBtn"); pg.wait_for_timeout(secs * 1000)
            toasts = pg.evaluate("window.__toasts")
            kinds = [re.search(r'\[(\w+)\]', t).group(1) for t in toasts]
            check(pg.text_content("#hudReps") == want_reps and kinds == want_kinds, f'{tag}{kind}：{pg.text_content("#hudReps")} 下 {toasts}')
            check(not pg.errs, tag + '沒有錯誤 ' + str(pg.errs[:2]))
            ctx.close()
        ctx, pg = fake_page(b, 'plank', '?workout=plank' + worker)
        pg.click("#startBtn"); pg.wait_for_timeout(7000)
        check(pg.evaluate("document.getElementById('hudRepsBox').classList.contains('holding')"), tag + '棒式撐住時秒數變綠')
        pg.wait_for_timeout(15000)
        reps = pg.evaluate("window.__reps"); toasts = pg.evaluate("window.__toasts")
        secs = [int(r.split(':')[1]) + 60 * int(r.split(':')[0]) for r in reps if ':' in r]
        check(toasts and re.match(r'第 1 次 · 撐了 0:1[0-3]( · 屁股太高 \[close\]| \[good\])$', toasts[-1]) is not None, tag + '棒式結束：' + str(toasts))
        check(max(secs) >= 10 and max(secs) <= 13 and pg.text_content("#hudReps") == '0:00', f'{tag}棒式最多 {max(secs)} 秒（撐 8＋4 秒，翹屁股 2 秒不算），結束後歸零')
        check(any('趴下' in s for s in pg.evaluate("window.__status")), tag + '起身後提示趴下')
        check(not pg.errs, tag + '沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()
    # 2. 介面：首頁卡片「開始伏地挺身」→ 選好並開鏡頭；選擇動作視窗；大字儀表板、角度標籤跟著換；記住；網址指定
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    check(pg.inner_text("#workoutNote") == '動作：自由（只顯示膝、髖角度，不計次數）', '首頁：' + pg.inner_text("#workoutNote"))
    btns = pg.evaluate("[...document.querySelectorAll('.exercises .start-workout')].map(b => b.textContent)")
    check(btns == ['開始深蹲', '開始伏地挺身', '開始棒式', '開始弓箭步'], '卡片按鈕：' + str(btns))
    pg.click("text=開始伏地挺身"); pg.wait_for_timeout(3500)
    check(pg.is_visible("#stage") and pg.evaluate("localStorage.getItem('workout')") == 'pushup', '按開始伏地挺身：開鏡頭、記住')
    labels = pg.evaluate("[...document.querySelectorAll('#hud .metric-label')].map(e => e.textContent)")
    check(labels == ['左肘', '左髖', '右肘', '右髖', '伏地挺身'] and pg.is_visible("#hudRepsBox") and pg.text_content("#hudReps") == '0', '儀表板：' + str(labels))
    check(pg.inner_text("#demoBtnText") == '伏地挺身', '右上角按鈕寫目前的動作')
    angle_keys = pg.evaluate("[...document.querySelectorAll('#labels [data-key^=\"angle-\"], #labels .angle')].map(e => e.dataset.key || e.className)")
    print('   角度標籤：', angle_keys[:6])
    pg.wait_for_timeout(2000)
    # 測試照片是正面站姿：先提示側身（側面拍站著時才會提示趴下，端到端測試的棒式起身那段有測）
    st = pg.inner_text("#poseStatus") + pg.inner_text("#banner")
    check('趴下' in st or '側身' in st, '站著／正面時提示：' + st)
    pg.click("#demoBtn"); pg.wait_for_timeout(300)
    tabs = pg.evaluate("[...document.querySelectorAll('.demo-tabs button')].map(b => (b.getAttribute('aria-pressed') === 'true' ? '*' : '') + b.textContent)")
    check(tabs == ['自由', '深蹲', '*伏地挺身', '棒式', '弓箭步'] and pg.inner_text("#demoTitle") == '選擇動作', '選擇動作視窗：' + str(tabs))
    check('手肘彎到 95° 以下算到位' in pg.inner_text("#demoCues"), '說明計算方式：' + pg.inner_text("#demoCues").replace('\n', ' / '))
    pg.click(".demo-tabs button:has-text('棒式')"); pg.wait_for_timeout(300)
    labels = pg.evaluate("[...document.querySelectorAll('#hud .metric-label')].map(e => e.textContent)")
    check(labels == ['左髖', '左膝', '右髖', '右膝', '棒式'] and pg.text_content("#hudReps") == '0:00' and pg.inner_text("#demoBtnText") == '棒式', '換棒式：' + str(labels))
    pg.click(".demo-tabs button:has-text('自由')"); pg.wait_for_timeout(300)
    check(pg.is_hidden("#hudRepsBox") and pg.inner_text("#demoBtnText") == '選擇動作' and pg.evaluate("document.getElementById('demoArt').hasAttribute('hidden')") and '不計次數' in pg.inner_text("#demoCues"), '換自由：沒有次數框、沒有動畫')
    pg.click(".demo-tabs button:has-text('深蹲')"); pg.wait_for_timeout(300)
    pg.click("#demoClose")
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(1500); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    meta = json.load(open(d.value.path()))['meta']
    check(meta.get('workout') == 'squat', '錄製檔記下 workout：' + str(meta.get('workout')))
    check(pg.get_attribute('#replayLink', 'href') == 'replay.html', '重播分析連結不帶參數（重播頁改看錄影記下的動作）')
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    check(pg.inner_text("#workoutNote").startswith('動作：深蹲') and pg.evaluate("document.querySelector('.exercises li.selected').dataset.exercise") == 'squat', '首頁寫目前的動作、卡片綠框')
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.inner_text("#workoutNote").startswith('動作：深蹲'), '重新整理後記得')
    pg.goto(base + "index.html?workout=lunge"); pg.wait_for_function(READY, timeout=60000)
    check(pg.inner_text("#workoutNote").startswith('動作：弓箭步') and pg.evaluate("localStorage.getItem('workout')") == 'squat', '網址 ?workout=lunge：用弓箭步、不記住')
    pg.goto(base + "index.html?lab=squat"); pg.wait_for_function(READY, timeout=60000)
    check(pg.inner_text("#workoutNote").startswith('動作：深蹲'), '舊網址 ?lab=squat 等於深蹲')
    check(not errs, '沒有錯誤 ' + str(errs[:3]))
    ctx.close()
    # 3. 版面：首頁卡片按鈕、鏡頭畫面三格（直拿）／右邊三格（橫拿）都在畫面內、不互相重疊
    for vw, vh, mob, wk in [(320, 640, True, 'plank'), (320, 640, True, 'squat'), (390, 844, True, 'plank'), (844, 390, True, 'plank'), (844, 390, True, 'squat'), (667, 375, True, 'plank'), (568, 320, True, 'plank'), (1280, 800, False, 'plank'), (1024, 600, False, 'squat')]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mob, has_touch=mob); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(640, 480) + "try { localStorage.setItem('workout', '" + wk + "'); } catch (e) {}")
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        r = pg.evaluate("() => [...document.querySelectorAll('.exercises .start-workout')].map(b => b.getBoundingClientRect().right).concat(document.documentElement.scrollWidth)")
        check(max(r[:-1]) <= vw and r[-1] == vw, f'{vw} 首頁卡片按鈕在畫面內 {r}')
        if vw in (320, 1280):
            pg.locator(".exercises").screenshot(path=f"{HERE}/cards_{vw}.png")
        pg.click("#startBtn"); pg.wait_for_timeout(3500)
        boxes = pg.evaluate("""() => [...document.querySelectorAll('#hud .metric')].filter(e => e.offsetParent || getComputedStyle(e).position === 'fixed').map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })
            .concat([['toolbar', ...(r => [r.left, r.top, r.right, r.bottom])(document.getElementById('toolbar').getBoundingClientRect())], ['demo', ...(r => [r.left, r.top, r.right, r.bottom])(document.getElementById('demoBtn').getBoundingClientRect())]])""")
        metrics = [m for m in boxes if not isinstance(m[0], str)]
        others = [m[1:] for m in boxes if isinstance(m[0], str)]
        hit = lambda a, c: not (a[2] <= c[0] or a[0] >= c[2] or a[3] <= c[1] or a[1] >= c[3])
        inside = all(m[0] >= 0 and m[2] <= vw and m[1] >= 0 and m[3] <= vh for m in metrics)
        overlap = [(i, j) for i in range(len(metrics)) for j in range(i + 1, len(metrics)) if hit(metrics[i], metrics[j])]
        cover = [o for o in others for m in metrics if hit(m, o)]
        check(len(metrics) == 5 and inside and not overlap, f'{vw}x{vh} 五格都在畫面內、不重疊 {len(metrics)} {overlap}')
        check(not cover, f'{vw}x{vh} 不蓋到工具列、右上角按鈕 {len(cover)}')
        pg.screenshot(path=f"{HERE}/live_{vw}x{vh}_{wk}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
