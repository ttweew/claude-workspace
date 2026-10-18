# 數據面板與錄製測試：開面板、錄 3 秒、下載 CSV 與 JSON 並檢查內容；也檢查各種螢幕的版面
from playwright.sync_api import sync_playwright
from audit_common import *
import csv, io, json
url = serve(8811)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, vw, vh, w, h in [("phone", 390, 760, 480, 640), ("small", 320, 568, 480, 640), ("landscape", 844, 390, 640, 480), ("laptop", 1280, 720, 640, 480)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, accept_downloads=True); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(w, h))
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_function(READY, timeout=60000); pg.click("#startBtn"); pg.wait_for_timeout(1500)
        pg.click("#dataBtn"); pg.wait_for_timeout(600)
        tb = pg.evaluate("(() => { const t = document.getElementById('toolbar'); return [t.scrollWidth, t.clientWidth, t.offsetHeight]; })()")
        rows = pg.evaluate("[...document.querySelectorAll('#dataRows tr')].map(tr => tr.innerText.replace(/\\s+/g, ' '))")
        pg.click("#recordBtn"); pg.wait_for_timeout(3000)
        rec = pg.inner_text("#recordInfo"); btn = pg.inner_text("#dataBtn")
        pg.screenshot(path=f"data_{name}.png")
        pg.click("#recordBtn"); pg.wait_for_timeout(300)
        after = pg.inner_text("#recordInfo")
        with pg.expect_download() as d: pg.click("#csvBtn")
        text = open(d.value.path(), encoding="utf-8-sig").read(); fname_csv = d.value.suggested_filename
        with pg.expect_download() as d: pg.click("#jsonBtn")
        import os; js = json.load(open(d.value.path(), encoding="utf-8")); fname_json = d.value.suggested_filename; print("   JSON bytes/frame", os.path.getsize(d.value.path())/len(js["frames"]), "CSV bytes/frame", len(text.encode())/(text.count(chr(10))-1))
        r = list(csv.reader(io.StringIO(text)))
        hdr, data = r[0], r[1:]
        lk = hdr.index("left_knee_x")
        print(f"[{name}] 工具列 捲動寬/可見寬/高={tb} 錯誤={errs}")
        print(f"   面板列數={len(rows)} 第一列='{rows[0]}' 最後='{rows[-1]}'")
        print(f"   錄製中='{rec}' 按鈕='{btn}' 停止後='{after}'")
        print(f"   CSV {fname_csv}: 欄數={len(hdr)} 列數={len(data)} 每列欄數一致={all(len(x)==len(hdr) for x in data)} 左膝x/y/z/vis={data[-1][lk:lk+4]} 公尺左膝={data[-1][hdr.index('left_knee_wx'):hdr.index('left_knee_wx')+3]}")
        print(f"   JSON {fname_json}: 格數={len(js['frames'])} meta={ {k: js['meta'][k] for k in ['computeMode','videoWidth','videoHeight','displayMirrored']} } 點名數={len(js['landmarkNames'])} 第一格點數={len(js['frames'][0]['landmarks'])}")
        ctx.close()
    b.close()
