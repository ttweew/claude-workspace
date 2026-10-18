from playwright.sync_api import sync_playwright
from audit_common import *
base = serve(8791, "before_pb")
CHIP = """(sel) => { const e = [...document.querySelectorAll('.joint-label')].find(x => !x.hidden && x.textContent.startsWith(sel));
  if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }"""
VIS = "[...document.querySelectorAll('.joint-label')].filter(x => !x.hidden).map(x => x.textContent)"
OVER = """(() => { const r = [...document.querySelectorAll('.joint-label')].filter(x => !x.hidden).map(x => x.getBoundingClientRect());
  let n = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    if (r[i].left < r[j].right && r[i].right > r[j].left && r[i].top < r[j].bottom && r[i].bottom > r[j].top) n++; return n; })()"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vp, cw, ch, dsf, rear in [("laptop", (1280, 720), 1280, 720, 1, False), ("phone", (390, 844), 720, 1280, 3, False), ("rear", (1280, 720), 1280, 720, 1, True)]:
        ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=dsf); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        mock_network(pg); pg.add_init_script(cam_script(cw, ch))
        if rear: pg.add_init_script("""const _g = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = async c => { const s = await _g(c); const t = s.getVideoTracks()[0]; const gs = t.getSettings.bind(t); t.getSettings = () => ({...gs(), facingMode: 'environment'}); return s; };""")
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_function("document.getElementById('poseStatus').textContent === '已偵測到全身'", timeout=30000)
        n0 = len(pg.evaluate(VIS))
        pg.click("#labelBtn"); pg.wait_for_timeout(600)
        vis = pg.evaluate(VIS); over = pg.evaluate(OVER); pg.screenshot(path=f"lbl2_{name}_on.png")
        knee = pg.evaluate(CHIP, "25"); sc = pg.evaluate(CHIP, "肩膀中心")
        pg.click("#labelBtn"); pg.wait_for_timeout(400); n_off = len(pg.evaluate(VIS))
        # 點選左膝（標籤在點的外側）與肩膀中心（標籤在點的正下方）
        results = []
        mir = pg.evaluate("document.getElementById('video').classList.contains('mirrored')")
        kx = knee[0] + knee[2] + 10 if mir else knee[0] - 10
        for tx, ty in [(kx, knee[1] + knee[3] / 2), (sc[0] + sc[2] / 2, sc[1] - 10)]:
            pg.mouse.click(tx, ty); pg.wait_for_timeout(300); results.append(pg.evaluate(VIS))
        pg.screenshot(path=f"lbl2_{name}_pick.png")
        pg.wait_for_timeout(3300); after = pg.evaluate(VIS)
        print(f"[{name}] 關閉時 {n0} 個 | 開啟 {len(vis)} 個 {vis} | 重疊 {over} 組 | 再關閉 {n_off} 個 | 點左膝→{results[0]} 點肩膀中心→{results[1]} | 3 秒後 {after} | 錯誤 {errs}")
        ctx.close()
    b.close()
