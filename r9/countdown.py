import sys, os, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8851)
OUT = os.path.dirname(os.path.abspath(__file__))
QUERY = os.environ.get('QUERY', '')
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 不用 cam_script（它會把倒數關掉）：自己做假鏡頭
CAM = cam_script(640, 480).replace(NO_COUNTDOWN, '')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=['--autoplay-policy=no-user-gesture-required'])
    for name, vw, vh, mobile in [('laptop', 1280, 720, False), ('phone', 390, 844, True), ('landscape', 844, 390, True)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' and not m.text.startswith('INFO:') else None)
        mock_network(pg); pg.add_init_script(CAM)
        pg.goto(base + "index.html" + QUERY); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn")
        check(pg.input_value("#countdownSelect") == '5', name + ' 預設倒數 5 秒')
        # 1. 正常倒數
        t0 = time.time(); pg.click("#recordBtn"); pg.wait_for_timeout(150)
        check(pg.is_visible("#countdown") and pg.inner_text("#countdown") == '5', name + ' 按下後顯示 5：' + pg.inner_text("#countdown"))
        check('取消倒數（5）' in pg.inner_text("#recordBtn") and pg.is_disabled("#countdownSelect"), name + ' 按鈕變取消、選單鎖住')
        check(pg.inner_text("#recordInfo") == '', name + ' 倒數中還沒開始錄：' + repr(pg.inner_text("#recordInfo")))
        pg.locator("#stage").screenshot(path=f"{OUT}/count_{name}.png")
        box = pg.locator("#countdown").bounding_box()
        check(box['x'] >= 0 and box['y'] >= 0 and box['x'] + box['width'] <= vw and box['y'] + box['height'] <= vh, name + ' 倒數圓圈在畫面內')
        pb = pg.locator("#dataPanel").bounding_box(); tb = pg.locator("#infobar").bounding_box()
        overlap = lambda a, c: not (a['x'] + a['width'] <= c['x'] or c['x'] + c['width'] <= a['x'] or a['y'] + a['height'] <= c['y'] or c['y'] + c['height'] <= a['y'])
        check(not overlap(box, pb) and not overlap(box, tb), name + ' 倒數圓圈沒有被數據面板、狀態列擋住')
        pg.wait_for_timeout(2000)
        check(pg.inner_text("#countdown") == '3', name + ' 2 秒後顯示 3：' + pg.inner_text("#countdown"))
        pg.wait_for_function("document.getElementById('recordBtn').textContent.includes('停止錄製')", timeout=8000)
        dt = time.time() - t0
        check(4.6 <= dt <= 5.8, name + f' 約 5 秒後開始錄（{dt:.2f} 秒）')
        check(pg.inner_text("#countdown") == '開始' and not pg.is_disabled("#countdownSelect"), name + ' 顯示「開始」、選單解鎖')
        pg.wait_for_timeout(1200)
        check(pg.is_hidden("#countdown"), name + ' 「開始」自動消失')
        pg.wait_for_timeout(1000); pg.click("#recordBtn")
        info = pg.inner_text("#recordInfo")
        check(info.startswith('已錄 ') and pg.is_visible("#csvBtn"), name + ' 錄好可以下載：' + info)
        # 2. 取消
        pg.click("#recordBtn"); pg.wait_for_timeout(1300)
        check(pg.inner_text("#countdown") == '4', name + ' 重新錄製也會倒數')
        pg.click("#recordBtn"); pg.wait_for_timeout(200)
        check(pg.is_hidden("#countdown") and pg.inner_text("#recordBtn") == '● 重新錄製' and pg.is_visible("#csvBtn"), name + ' 取消後回到原狀、上一段還能下載')
        pg.wait_for_timeout(4500)
        check(pg.inner_text("#recordInfo") == info, name + ' 取消後不會自己開始錄')
        # 3. 倒數中關鏡頭，再開
        pg.click("#recordBtn"); pg.wait_for_timeout(500)
        pg.click("#stopBtn"); pg.wait_for_timeout(5500)
        check(pg.is_hidden("#countdown"), name + ' 關鏡頭後倒數消失')
        pg.click("#startBtn"); pg.wait_for_timeout(1500)
        if pg.is_hidden("#dataPanel"): pg.click("#dataBtn")
        rb = pg.inner_text("#recordBtn")
        check('停止' not in rb and '取消' not in rb and pg.is_hidden("#countdown") and not pg.is_disabled("#countdownSelect"), name + ' 重開鏡頭後沒有殘留倒數：' + rb)
        # 4. 不倒數：馬上開始，而且會記住
        pg.select_option("#countdownSelect", '0')
        pg.click("#recordBtn"); pg.wait_for_timeout(150)
        check('停止錄製' in pg.inner_text("#recordBtn") and pg.is_hidden("#countdown"), name + ' 不倒數時馬上開始錄')
        pg.click("#recordBtn")
        pg.select_option("#countdownSelect", '3')
        pg.reload(); pg.wait_for_function(READY, timeout=60000)
        check(pg.input_value("#countdownSelect") == '3', name + ' 重新整理後記得選擇')
        # 5. 倒數中收起數據面板：倒數照常，錄製照常開始
        pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn")
        pg.click("#recordBtn"); pg.click("#dataBtn")
        pg.wait_for_timeout(3600)
        check('●' in pg.inner_text("#dataBtn"), name + ' 面板收起來也照常開始錄（數據鈕有紅點）')
        check(not errs, name + ' 沒有錯誤 ' + str(errs[:3]))
        ctx.close()
    b.close()
print('ALLOK' if ok else 'SOMEFAIL')
