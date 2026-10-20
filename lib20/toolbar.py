# 工具列在各種寬度、各種狀態（錄製中、暫停、數據面板打開、有鏡頭選單）都排得下一行
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
src = open('smoke.py').read()
exec(src.split("with sync_playwright() as p:")[0].replace("serve(8890", "serve(8893"))
CHECK = """() => { const t = document.getElementById('toolbar'); const bs = [...t.children].filter(e => !e.hidden && e.getClientRects().length);
  const tops = new Set(bs.map(e => Math.round(e.getBoundingClientRect().top))); const right = Math.max(...bs.map(e => e.getBoundingClientRect().right));
  return [tops.size, Math.round(right), innerWidth, t.scrollWidth, document.getElementById('dataBtn').textContent.trim()]; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    bad = 0
    for vw in [320, 360, 375, 390, 414, 480, 600, 844]:
        ctx = b.new_context(viewport={"width": vw, "height": 740 if vw < 600 else 390}, is_mobile=True, has_touch=True)
        ctx.route(CDN + "/**", fake_cdn('squat_mix'))
        ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script("localStorage.setItem('recordCountdown','0')")
        pg = ctx.new_page()
        pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_timeout(1200)
        res = []
        res.append(('idle', pg.evaluate(CHECK)))
        pg.click('#recModeBtn'); pg.click('#recMain'); pg.wait_for_timeout(500); res.append(('rec', pg.evaluate(CHECK)))
        pg.click('#recPause'); pg.wait_for_timeout(300); res.append(('paused', pg.evaluate(CHECK)))
        pg.click('#dataBtn'); pg.wait_for_timeout(300); res.append(('data', pg.evaluate(CHECK)))
        # 有兩顆以上鏡頭時的選單（假鏡頭只有一顆，直接叫它出來）
        pg.evaluate("() => { const s = document.getElementById('cameraSelect'); s.innerHTML = '<option>後鏡頭（超廣角）camera2 0, facing back</option>'; s.hidden = false; }"); pg.wait_for_timeout(200)
        res.append(('select', pg.evaluate(CHECK)))
        for name, (rows, right, w, sw, dtext) in res:
            ok = rows == 1 and right <= w and sw <= w
            bad += not ok
            print(('PASS' if ok else 'FAIL'), vw, name, rows, right, w, dtext)
        pg.screenshot(path=f'tb_{vw}.png', clip={'x': 0, 'y': 0, 'width': vw, 'height': 60})
        ctx.close()
    print('ALL PASS' if not bad else 'SOME FAIL')
