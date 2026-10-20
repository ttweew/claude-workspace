# 錄製剩 30 秒、錄滿 5 分鐘的提醒：把頁面的 performance.now 往後跳，不用真的等 5 分鐘
import sys, os, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8852)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
JUMP = "window.__tOff = 0; { const o = performance.now.bind(performance); performance.now = () => o() + window.__tOff; }"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=['--autoplay-policy=no-user-gesture-required'])
    for name, vw, vh, mobile in [('laptop', 1280, 720, False), ('phone', 390, 844, True), ('landscape', 844, 390, True)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' and not m.text.startswith('INFO:') else None)
        mock_network(pg); pg.add_init_script(JUMP); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn")
        pg.click("#recordBtn"); pg.wait_for_timeout(1500)
        info = pg.inner_text("#recordInfo")
        check(info.startswith('錄製中 0:0') and '／5:00' in info, name + ' 錄製中顯示已錄／上限：' + info)
        check(pg.is_hidden("#recNotice"), name + ' 一開始沒有提醒')
        pg.evaluate("window.__tOff += 268000"); pg.wait_for_timeout(2500)
        info = pg.inner_text("#recordInfo")
        check(pg.is_visible("#recNotice") and pg.inner_text("#recNotice") == '錄製剩 30 秒', name + ' 剩 30 秒時大字提醒：' + pg.inner_text("#recNotice") + ' | ' + info)
        box = pg.locator("#recNotice").bounding_box()
        pb = pg.locator("#dataPanel").bounding_box(); tb = pg.locator("#infobar").bounding_box()
        overlap = lambda a, c: not (a['x'] + a['width'] <= c['x'] or c['x'] + c['width'] <= a['x'] or a['y'] + a['height'] <= c['y'] or c['y'] + c['height'] <= a['y'])
        check(box['x'] >= 0 and box['x'] + box['width'] <= vw and box['y'] >= 0 and box['y'] + box['height'] <= vh, name + ' 提醒在畫面內')
        check(not overlap(box, pb) and not overlap(box, tb), name + ' 提醒沒有被數據面板、狀態列擋住')
        pg.locator("#stage").screenshot(path=f"{OUT}/warn_{name}.png")
        pg.wait_for_timeout(3500)
        check(pg.is_hidden("#recNotice"), name + ' 剩 30 秒的提醒 3 秒後消失')
        pg.evaluate("window.__tOff += 30000"); pg.wait_for_timeout(1500)
        info = pg.inner_text("#recordInfo")
        check('已錄滿 5 分鐘，自動停止' in pg.inner_text("#recNotice") and pg.is_visible("#recNotice"), name + ' 錄滿時大字提醒：' + pg.inner_text("#recNotice"))
        check(info.startswith('已錄 4:') and '（已錄滿 5 分鐘，自動停止）' in info and pg.is_visible("#jsonBtn"), name + ' 面板寫明錄滿、可以下載：' + info)
        check('錄下一段' in pg.inner_text("#recordBtn"), name + ' 按鈕回到「錄下一段」（10/20 起錄滿的那一段存進錄製檔）')
        pg.locator("#stage").screenshot(path=f"{OUT}/full_{name}.png")
        pg.wait_for_timeout(6500)
        check(pg.is_hidden("#recNotice"), name + ' 錄滿提醒 6 秒後消失')
        # 自己按停止：不顯示錄滿
        pg.click("#recordBtn")
        pg.wait_for_function("document.getElementById('recordBtn').textContent.includes('停止錄製')", timeout=10000)
        pg.wait_for_timeout(800); pg.click("#recordBtn"); pg.wait_for_timeout(300)
        info = pg.inner_text("#recordInfo")
        check('錄滿' not in info and pg.is_hidden("#recNotice"), name + ' 自己按停止不會寫錄滿：' + info)
        # 剩 30 秒提醒中關鏡頭：提醒收掉
        pg.click("#recordBtn"); pg.wait_for_function("document.getElementById('recordBtn').textContent.includes('停止錄製')", timeout=10000)
        pg.evaluate("window.__tOff += 275000"); pg.wait_for_timeout(1200)
        shown = pg.is_visible("#recNotice")
        pg.click("#stopBtn"); pg.wait_for_timeout(300)
        check(shown and pg.is_hidden("#recNotice"), name + ' 提醒中關鏡頭，提醒一起收掉')
        check(not errs, name + ' 沒有錯誤 ' + str(errs[:3]))
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
