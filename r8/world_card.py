import sys, json, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8841)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vw, vh, mobile in [('laptop', 1280, 900, False), ('phone', 360, 780, True)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(base + "replay.html")
        pg.click("#demoSide"); pg.wait_for_function("!document.getElementById('worldCard').hidden", timeout=10000)
        bones = pg.inner_text("#boneTable"); knees = pg.inner_text("#kneeTable"); note = pg.inner_text("#kneeNote")
        print(bones); print(knees)
        check('40.' in bones and '捲尺' not in bones, name + ' 骨頭表有長度、沒填捲尺時沒有捲尺欄')
        check('側面拍時' in note, name + ' 側面示範有對照說明')
        pg.fill("#tapeThigh", "40"); pg.wait_for_timeout(100)
        bones2 = pg.inner_text("#boneTable"); print(bones2)
        check('差 +0.' in bones2 and '捲尺' in bones2, name + ' 填捲尺後出現差距')
        pg.fill("#tapeThigh", "abc" if False else ""); pg.wait_for_timeout(100)
        check('捲尺' not in pg.inner_text("#boneTable"), name + ' 清空捲尺後欄位消失')
        pg.fill("#tapeShank", "999"); pg.wait_for_timeout(100)
        check('捲尺' not in pg.inner_text("#boneTable"), name + ' 不合理的長度不採用')
        pg.fill("#tapeShank", "")
        btn = pg.locator("#toggles button", has_text="3D 膝角")
        check(btn.count() == 1, name + ' 有 3D 膝角按鈕')
        btn.click(); pg.wait_for_timeout(200)
        check(btn.get_attribute('aria-pressed') == 'true', name + ' 3D 膝角按鈕按下')
        pg.locator("#chart").scroll_into_view_if_needed()
        box = pg.query_selector("#chart").bounding_box()
        pg.mouse.click(box['x'] + box['width'] * 0.36, box['y'] + box['height'] / 2); pg.wait_for_timeout(200)
        ro = pg.inner_text("#readout"); print(' readout', ro)
        check('3D（處理過）左膝' in ro, name + ' 讀數有 3D 膝角')
        with pg.expect_download() as dl:
            pg.click("#csvOut")
        csv = open(dl.value.path(), encoding='utf-8-sig').read().splitlines()
        hdr = csv[0].split(','); row = csv[len(csv) // 2].split(',')
        check(hdr[-12:] == ['left_knee_3d_raw', 'left_knee_3d_stable', 'right_knee_3d_raw', 'right_knee_3d_stable', 'left_thigh_cm_raw', 'left_thigh_cm_stable', 'right_thigh_cm_raw', 'right_thigh_cm_stable', 'left_shank_cm_raw', 'left_shank_cm_stable', 'right_shank_cm_raw', 'right_shank_cm_stable'], name + ' 角度 CSV 有 3D 欄位')
        check(all(len(l.split(',')) == len(hdr) for l in csv[1:]) and row[-1] != '', name + ' 每列欄位數相同、有數值 ' + ','.join(row[-4:]))
        hs = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        check(not hs, name + ' 沒有左右捲動')
        pg.locator("#worldCard").screenshot(path=f"{OUT}/world_{name}.png")
        pg.click("#demoFront"); pg.wait_for_timeout(800)
        check('沒有判斷為側面' in pg.inner_text("#kneeNote"), name + ' 正面示範提示用實驗 H')
        check(pg.locator("#toggles button", has_text="3D 膝角").get_attribute('aria-pressed') == 'true', name + ' 換檔後 3D 按鈕狀態保留')
        # 舊檔案（沒有公尺座標）：卡片收起來、沒有 3D 按鈕
        from_js = pg.evaluate("import('./js/data/synth.js').then(m => { const r = m.makeDemoRecording({ yaw: 8 }); r.frames.forEach(f => delete f.world); return JSON.stringify(r); })")
        pg.set_input_files("#fileInput", files=[{"name": "old.json", "mimeType": "application/json", "buffer": from_js.encode()}]); pg.wait_for_timeout(800)
        check(pg.is_hidden("#worldCard") and pg.locator("#toggles button", has_text="3D 膝角").count() == 0, name + ' 沒有公尺座標的檔案：卡片與按鈕都不顯示')
        check('3D' not in pg.inner_text("#readout"), name + ' 沒有公尺座標時讀數沒有 3D')
        # 公尺座標壞掉的檔案
        bad = json.loads(from_js); 
        for i, f in enumerate(bad['frames']):
            if f['landmarks']: f['world'] = 'oops' if i % 2 else [[None, 'x', 1]] * 33
        pg.set_input_files("#fileInput", files=[{"name": "bad.json", "mimeType": "application/json", "buffer": json.dumps(bad).encode()}]); pg.wait_for_timeout(800)
        st = pg.inner_text("#loadStatus")
        check('已讀取' in st, name + ' 公尺座標壞掉時其他分析照常：' + st)
        check(not errs, name + ' 沒有錯誤 ' + str(errs[:3]))
        ctx.close()
    # 網站真的錄一段（假鏡頭），JSON 和 CSV 的 3D 結果要一樣
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(3000); pg.click("#recordBtn")
    with pg.expect_download() as d1: pg.click("#jsonBtn")
    with pg.expect_download() as d2: pg.click("#csvBtn")
    jb, cb = open(d1.value.path(), 'rb').read(), open(d2.value.path(), 'rb').read()
    pg.goto(base + "replay.html")
    pg.set_input_files("#fileInput", files=[{"name": "rec.json", "mimeType": "application/json", "buffer": jb}]); pg.wait_for_timeout(800)
    tj = pg.inner_text("#boneTable"); vis_j = pg.is_visible("#worldCard")
    pg.set_input_files("#fileInput", files=[{"name": "rec.csv", "mimeType": "text/csv", "buffer": cb}]); pg.wait_for_timeout(800)
    tc = pg.inner_text("#boneTable")
    print(tj)
    check(vis_j, '真實錄製 JSON 有 3D 卡片')
    check(tj == tc, '真實錄製 JSON、CSV 的骨頭表相同')
    check(not errs, '錄製流程沒有錯誤 ' + str(errs[:3]))
    b.close()
print('ALLOK' if ok else 'SOMEFAIL')
