# 深蹲實驗模式下，儀表板三格（三位數角度）在各種螢幕都要排得下
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8843)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for q in ['?lab=squat', '']:
        for name, vw, vh in [('SE', 320, 568), ('S9', 360, 740), ('i13', 390, 844), ('max', 430, 932), ('land', 844, 390), ('SEland', 568, 320), ('laptop', 1280, 720)]:
            ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=vw < 900, has_touch=vw < 900)
            pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            mock_network(pg); pg.add_init_script(cam_script(640, 480))
            pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
            pg.click("#startBtn"); pg.wait_for_timeout(1500)
            # 最寬的情況：兩個三位數角度、兩位數次數，同時顯示每一下的提示
            pg.evaluate("""document.getElementById('hudKnee').textContent = '167°'; document.getElementById('hudHip').textContent = '159°';
              document.getElementById('hudReps').textContent = '12';
              const t = document.getElementById('repToast'); t.textContent = '第 12 下 · 125° 再低一點'; t.className = 'close'; t.hidden = false;""")
            pg.wait_for_timeout(100)
            r = pg.evaluate("""(() => { const h = document.getElementById('hud').getBoundingClientRect(); const t = document.getElementById('repToast').getBoundingClientRect();
              const ib = document.getElementById('infobar').getBoundingClientRect();
              const v = document.querySelector('#hud .metric-value'); return { hud: [Math.round(h.left), Math.round(h.right), Math.round(h.top), Math.round(h.bottom)], digitPx: Math.round(parseFloat(getComputedStyle(v).fontSize)),
                toast: [Math.round(t.left), Math.round(t.right), Math.round(t.top), Math.round(t.bottom)], infobarBottom: Math.round(ib.bottom), vw: innerWidth, vh: innerHeight }; })()""")
            inside = r['hud'][0] >= 0 and r['hud'][1] <= vw and r['hud'][3] <= vh and r['hud'][2] >= 0
            toast_ok = q == '' or (r['toast'][0] >= 0 and r['toast'][1] <= vw and r['toast'][2] >= r['infobarBottom'])
            tag = ('lab' if q else 'plain') + '_' + name
            if name in ('SE', 'i13', 'land'): pg.screenshot(path=f"{HERE}/fit_{tag}.png")
            print(f"{'OK ' if inside and toast_ok else 'BAD'} [{tag}] {r} errors={errs}")
            ctx.close()
    b.close()
