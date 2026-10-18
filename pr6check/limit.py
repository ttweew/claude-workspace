# 錄製上限可選 5/10/15/20 分鐘：選單、記住選擇、錄製中顯示、錄滿提醒、手機提醒、版面
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
base = serve(8813, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
JUMP = "window.__tOff = 0; { const o = performance.now.bind(performance); performance.now = () => o() + window.__tOff; }"
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=['--autoplay-policy=no-user-gesture-required'])
    for name, vw, vh, mobile, ua in [('laptop', 1280, 720, False, None), ('iphone', 390, 844, True, IPHONE),
                                     ('android-320', 320, 640, True, ANDROID), ('landscape', 844, 390, True, IPHONE)]:
        kw = dict(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        if ua: kw['user_agent'] = ua
        ctx = b.new_context(**kw)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' and not m.text.startswith('INFO:') else None)
        mock_network(pg); pg.add_init_script(JUMP); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn")
        check(pg.input_value("#limitSelect") == '5', name + ' 預設 5 分鐘')
        check(pg.inner_text("#limitNote") == '檔案約 35 MB', name + ' 顯示檔案大小：' + pg.inner_text("#limitNote"))
        notes = {}
        for m in ['10', '15', '20']:
            pg.select_option("#limitSelect", m); pg.wait_for_timeout(100)
            notes[m] = (pg.inner_text("#limitNote"), 'warn' in (pg.get_attribute("#limitNote", "class") or ''))
        phone = ua is not None
        check(notes['10'] == ('檔案約 70 MB', False), name + ' 10 分鐘：' + str(notes['10']))
        for m, mb in [('15', 100), ('20', 135)]:
            t, w = notes[m]
            if phone:
                check(t.startswith('檔案約 %d MB。手機錄太久' % mb) and w, name + f' 手機選 {m} 分鐘有提醒：' + t)
            else:
                check(t == '檔案約 %d MB' % mb and not w, name + f' 電腦選 {m} 分鐘不提醒：' + t)
        # 版面：選單、提醒都在數據面板裡，不超出畫面
        pb = pg.locator("#dataPanel").bounding_box()
        for sel in ['#limitSelect', '#limitNote', '#panelToggle', '#recordBtn']:
            bb = pg.locator(sel).bounding_box()
            check(bb['x'] >= pb['x'] - 0.5 and bb['x'] + bb['width'] <= pb['x'] + pb['width'] + 0.5 and bb['x'] + bb['width'] <= vw,
                  name + f' {sel} 在面板裡 x={bb["x"]:.0f}..{bb["x"]+bb["width"]:.0f} 面板 {pb["x"]:.0f}..{pb["x"]+pb["width"]:.0f}')
        pg.locator("#dataPanel").screenshot(path=f"{OUT}/panel_{name}_20.png")
        # 記住選擇：重新整理後還是 20
        pg.reload(); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn")
        check(pg.input_value("#limitSelect") == '20', name + ' 重新整理後記得 20 分鐘')
        pg.select_option("#limitSelect", '10')
        # 錄製中：顯示 ／10:00、選單不能改、大小提示收起來
        pg.select_option("#countdownSelect", '0')
        pg.click("#recordBtn"); pg.wait_for_timeout(1500)
        info = pg.inner_text("#recordInfo")
        check('／10:00' in info, name + ' 錄製中顯示上限 10 分鐘：' + info)
        check(pg.is_disabled("#limitSelect") and pg.is_hidden("#limitNote"), name + ' 錄製中選單不能改、大小提示收起')
        pg.evaluate("window.__tOff += 568000"); pg.wait_for_timeout(2500)
        check(pg.is_visible("#recNotice") and pg.inner_text("#recNotice") == '錄製剩 30 秒', name + ' 10 分鐘的剩 30 秒提醒：' + pg.inner_text("#recNotice"))
        pg.evaluate("window.__tOff += 30000"); pg.wait_for_timeout(1500)
        info = pg.inner_text("#recordInfo")
        check('已錄滿 10 分鐘，自動停止' in pg.inner_text("#recNotice"), name + ' 錄滿 10 分鐘提醒：' + pg.inner_text("#recNotice"))
        check('（已錄滿 10 分鐘，自動停止）' in info and info.startswith('已錄 9:') or info.startswith('已錄 10:'), name + ' 面板：' + info)
        check(not pg.is_disabled("#limitSelect") and pg.is_visible("#limitNote"), name + ' 停止後選單可以改、大小提示回來')
        # 下載的 JSON：最後一格在 10 分鐘以內
        with pg.expect_download() as d:
            pg.click("#jsonBtn")
        import json
        data = json.load(open(d.value.path()))
        last = data['frames'][-1]['t']
        check(570000 < last <= 600000, name + f' JSON 最後一格 {last} 毫秒')
        # 錄製中換成 5 分鐘不行；停止後換成 5：再錄就是 5 分鐘
        pg.select_option("#limitSelect", '5')
        pg.click("#recordBtn"); pg.wait_for_timeout(1000)
        check('／5:00' in pg.inner_text("#recordInfo"), name + ' 換回 5 分鐘：' + pg.inner_text("#recordInfo"))
        pg.click("#recordBtn"); pg.wait_for_timeout(300)
        # 關鏡頭時錄製中也能恢復選單
        pg.click("#recordBtn"); pg.wait_for_timeout(800)
        pg.click("#stopBtn"); pg.wait_for_timeout(300)
        check(not pg.is_disabled("#limitSelect"), name + ' 錄製中關鏡頭，選單恢復可以改')
        check(not errs, name + ' 沒有錯誤 ' + str(errs[:3]))
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
