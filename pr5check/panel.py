# 鏡頭畫面的「示範」視窗：開關、切換動作、記住、Esc 關閉、關鏡頭時收起、版面不超出畫面、不擋工具列
# 也檢查首頁的動畫在鏡頭畫面打開時停下來（不和 AI 搶運算）
import sys, os, re
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8822, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
COUNT_RAF = "window.__raf = 0; { const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => r(t => { window.__raf++; cb(t); }); }"
rect = lambda pg, sel: pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }})()")
overlap = lambda a, b: not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vw, vh, mobile in [('laptop', 1280, 720, False), ('iphone', 390, 844, True), ('w320', 320, 640, True), ('landscape', 844, 390, True)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' and not m.text.startswith('INFO:') else None)
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(2500)
        check(pg.is_visible("#demoBtn") and pg.is_hidden("#demoPanel"), f'{name} 鏡頭畫面右上角有「示範」，視窗一開始收著')
        # 示範按鈕不和狀態標籤、工具列重疊
        btn = rect(pg, '#demoBtn')
        for sel in ['#poseStatus', '#perfBtn', '#toolbar']:
            if pg.is_visible(sel): check(not overlap(btn, rect(pg, sel)) or sel == '#toolbar' and btn[1] >= rect(pg, sel)[3] - 0.5, f'{name} 示範按鈕不擋 {sel}')
        check(btn[2] <= vw and pg.evaluate("document.documentElement.scrollWidth") == vw, f'{name} 示範按鈕在畫面內 {btn}')
        pg.click("#demoBtn"); pg.wait_for_timeout(600)
        check(pg.is_visible("#demoPanel") and pg.get_attribute("#demoBtn", "aria-expanded") == 'true', f'{name} 按下去打開')
        pan = rect(pg, '#demoPanel')
        check(pan[0] >= 0 and pan[2] <= vw + 0.5 and pan[3] <= vh + 0.5, f'{name} 視窗在畫面內 {[round(x) for x in pan]}')
        check(pg.inner_text("#demoTitle") == '動作示範' and pg.locator(".demo-tabs button").count() == 4, f'{name} 標題和四個動作')
        cues = pg.inner_text("#demoCues")
        check('膝蓋彎到 90° 以下才算蹲到位' in cues, f'{name} 預設深蹲的重點：' + cues.replace('\n', '／'))
        # 動畫在動：數字會變
        t1 = pg.text_content("#demoArt .demo-chip text"); pg.wait_for_timeout(700); t2 = pg.text_content("#demoArt .demo-chip text")
        check(t1 != t2 and t1.endswith('°'), f'{name} 動畫在動：{t1} → {t2}')
        pg.screenshot(path=f"{OUT}/panel_{name}.png")
        # 切換成棒式
        pg.click(".demo-tabs button[data-exercise=plank]"); pg.wait_for_timeout(1300)
        check(pg.get_attribute(".demo-tabs button[data-exercise=plank]", "aria-pressed") == 'true' and '腰不要塌' in pg.inner_text("#demoCues")
              and pg.text_content("#demoArt .demo-chip text").startswith('撐住'), f'{name} 換成棒式：' + pg.text_content("#demoArt .demo-chip text"))
        # Esc 關閉
        pg.focus(".demo-tabs button[data-exercise=plank]"); pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check(pg.is_hidden("#demoPanel") and pg.evaluate("document.activeElement.id") == 'demoBtn', f'{name} Esc 關閉、焦點回到按鈕')
        # 記住：重新打開還是棒式；重新整理也是
        pg.click("#demoBtn"); pg.wait_for_timeout(200)
        check(pg.get_attribute(".demo-tabs button[data-exercise=plank]", "aria-pressed") == 'true', f'{name} 再打開還是棒式')
        pg.click("#demoClose"); pg.wait_for_timeout(200)
        check(pg.is_hidden("#demoPanel"), f'{name} ✕ 關閉')
        # 開著視窗時關鏡頭：視窗收起
        pg.click("#demoBtn"); pg.wait_for_timeout(200); pg.click("#stopBtn"); pg.wait_for_timeout(300)
        check(pg.is_hidden("#demoPanel") and pg.get_attribute("#demoBtn", "aria-expanded") == 'false', f'{name} 關鏡頭時視窗收起')
        check(not errs, f'{name} 沒有錯誤 {errs[:3]}')
        ctx.close()
    # 首頁的動畫：看得到才動；鏡頭畫面打開時停下來；關掉後又動
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); pg = ctx.new_page()
    mock_network(pg); pg.add_init_script(cam_script(640, 480)); pg.add_init_script(COUNT_RAF)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    chip = lambda: pg.text_content(".exercises [data-exercise=squat] .demo-chip text")
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(500)
    a = chip(); pg.wait_for_timeout(700)
    check(a == chip(), f'首頁捲到最上面（卡片看不到）時卡片的動畫不動：{a}')
    pg.locator(".exercises").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    a = chip(); pg.wait_for_timeout(700); b2 = chip()
    check(a != b2, f'捲到卡片時動畫在動：{a} → {b2}')
    pg.click("#startBtn") if pg.is_visible("#startBtn") else pg.evaluate("document.getElementById('startBtn').click()")
    pg.wait_for_timeout(2500)
    a = chip(); pg.wait_for_timeout(800)
    check(a == chip(), f'鏡頭畫面打開時，首頁卡片的動畫停下來：{a}')
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    pg.locator(".exercises").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    a = chip(); pg.wait_for_timeout(700)
    check(a != chip(), '關掉鏡頭後首頁卡片的動畫又動了')
    ctx.close()
    # 減少動態效果：停在最低點，不動
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, reduced_motion='reduce'); pg = ctx.new_page()
    mock_network(pg)
    pg.goto(base + "index.html"); pg.locator(".exercises").scroll_into_view_if_needed(); pg.wait_for_timeout(500)
    a = [pg.text_content(f".exercises [data-exercise={x}] .demo-chip text") for x in ['squat', 'pushup', 'plank', 'lunge']]
    pg.wait_for_timeout(800)
    bb = [pg.text_content(f".exercises [data-exercise={x}] .demo-chip text") for x in ['squat', 'pushup', 'plank', 'lunge']]
    check(a == bb and a[0] == '85°', f'減少動態效果：停在最低點不動 {a}')
    ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
