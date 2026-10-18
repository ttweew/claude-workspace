from playwright.sync_api import sync_playwright
from audit_common import *
import json, sys
base = serve(8780)
tag = sys.argv[1] if len(sys.argv) > 1 else "before"
METRICS = """(() => {
  const vw = innerWidth, vh = innerHeight, r = e => document.getElementById(e).getBoundingClientRect();
  const tb = document.getElementById('toolbar');
  const btns = [...tb.querySelectorAll('button, select')].filter(b => !b.hidden).map(b => { const q = b.getBoundingClientRect(); return [b.id, Math.round(q.width), Math.round(q.height), Math.round(q.right)]; });
  return { toolbarH: Math.round(r('toolbar').height), toolbarOverflow: tb.scrollWidth > tb.clientWidth + 1,
           btnOutside: btns.filter(b => b[3] > vw + 1).map(b => b[0]), smallBtns: btns.filter(b => b[2] < 32).map(b => b[0]),
           infobarTop: Math.round(r('infobar').top), infobarBottom: Math.round(r('infobar').bottom),
           fullscreenBtnHidden: document.getElementById('fullscreenBtn').hidden };
})()"""
HOME = """(() => { const b = document.getElementById('startBtn').getBoundingClientRect();
  return { hScroll: document.documentElement.scrollWidth > innerWidth, startBtn: [Math.round(b.width), Math.round(b.height)],
           footerVisible: document.querySelector('footer').getBoundingClientRect().bottom <= innerHeight + 1 }; })()"""
with sync_playwright() as p:
    D = p.devices
    cases = [
        ("iPhone SE", D["iPhone SE"], 720, 1280), ("iPhone 13", D["iPhone 13"], 720, 1280),
        ("iPhone 13 橫式", D["iPhone 13 landscape"], 1280, 720), ("iPhone 14 Pro Max", D["iPhone 14 Pro Max"], 720, 1280),
        ("Pixel 7", D["Pixel 7"], 720, 1280), ("Galaxy S9+", D["Galaxy S9+"], 720, 1280),
        ("Pixel 7 橫式", D["Pixel 7 landscape"], 1280, 720), ("iPad Mini", D["iPad Mini"], 720, 1280),
        ("iPad Pro 11 橫式", D["iPad Pro 11 landscape"], 1280, 720),
        ("筆電 1366x768", {"viewport": {"width": 1366, "height": 768}}, 1280, 720),
        ("筆電 1280x720", {"viewport": {"width": 1280, "height": 720}}, 640, 480),
        ("桌機 1920x1080", {"viewport": {"width": 1920, "height": 1080}}, 1280, 720),
        ("2K 2560x1440", {"viewport": {"width": 2560, "height": 1440}}, 1920, 1080),
    ]
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    results = []
    for i, (name, dev, cw, ch) in enumerate(cases):
        opts = {k: v for k, v in dev.items() if k != "default_browser_type"}
        ctx = b.new_context(**opts); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
        pg.on("console", lambda m: errs.append("console " + m.text[:120]) if m.type == "error" and "XNNPACK" not in m.text else None)
        mock_network(pg); pg.add_init_script(cam_script(cw, ch))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        home = pg.evaluate(HOME); pg.screenshot(path=f"audit/{tag}_{i:02d}_home.png")
        pg.click("#startBtn"); pg.wait_for_function("document.getElementById('poseStatus').textContent === '已偵測到全身'", timeout=30000)
        pg.click("#labelBtn"); pg.wait_for_timeout(500)
        m = pg.evaluate(METRICS); pg.screenshot(path=f"audit/{tag}_{i:02d}_cam.png")
        vp = opts.get("viewport")
        results.append((name, f"{vp['width']}x{vp['height']}", home, m, errs))
        print(f"{name:16s} {vp['width']}x{vp['height']:<5} 首頁{home} | 鏡頭{m} | 錯誤{errs}")
        ctx.close()
    b.close()
