import sys, json, os
sys.path.insert(0, '..')
sys.path.insert(0, '.')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8831 + 1000, '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-pr6')
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vw, vh, mobile in [('laptop', 1280, 900, False), ('phone', 390, 844, True)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(base + "replay.html")
        pg.click("#demoSide"); pg.wait_for_timeout(600)
        st = pg.inner_text("#loadStatus")
        summ = pg.inner_text("#summary").replace('\n', ' | ')
        # 點曲線（約第二下最低點）
        pg.locator("#chart").scroll_into_view_if_needed()
        box = pg.query_selector("#chart").bounding_box()
        pg.mouse.click(box['x'] + box['width'] * 0.36, box['y'] + box['height'] / 2); pg.wait_for_timeout(200)
        ro = pg.inner_text("#readout")
        aspect_shown = pg.is_visible("#aspectRow")
        statsTxt = pg.inner_text("#stats")
        pg.locator("#csvOut").scroll_into_view_if_needed(); pg.wait_for_timeout(300)
        hit = pg.evaluate("(() => { const r = document.getElementById('csvOut').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 8, r.top + 8); return e && (e.id || e.tagName + '.' + e.className); })()")
        print('  hit-test at csvOut:', hit)
        with pg.expect_download() as dl:
            pg.click("#csvOut", timeout=8000)
        path = dl.value.path(); csv = open(path, encoding='utf-8-sig').read().splitlines()
        hscroll = pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        pg.screenshot(path=f"{OUT}/replay_{name}_side.png", full_page=True)
        pg.click("#demoFront"); pg.wait_for_timeout(600)
        pg.locator("#chart").scroll_into_view_if_needed()
        box = pg.query_selector("#chart").bounding_box()
        pg.mouse.click(box['x'] + box['width'] * 0.36, box['y'] + box['height'] / 2); pg.wait_for_timeout(200)
        ro2 = pg.inner_text("#readout")
        pg.screenshot(path=f"{OUT}/replay_{name}_front.png", full_page=True)
        # 播放 1 秒
        pg.click("#playBtn"); pg.wait_for_timeout(1000); ro3 = pg.inner_text("#readout"); pg.click("#playBtn")
        print(f"[{name}] status={st!r}\n  summary={summ}\n  readout(side)={ro!r}\n  readout(front)={ro2!r}\n  after play={ro3.splitlines()[0]!r}\n  csv rows={len(csv)} header={csv[0][:120]}\n  hscroll={hscroll} aspectRow(JSON)={aspect_shown} errors={errs}")
        print('  stats:', statsTxt.replace('\n', ' | ')[:400])
        ctx.close()
    # 真的 JSON / CSV 檔：用網站錄一段再丟進去
    ctx = b.new_context(viewport={"width": 1280, "height": 720}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(3000); pg.click("#recordBtn")
    with pg.expect_download() as d1: pg.click("#jsonBtn")
    with pg.expect_download() as d2: pg.click("#csvBtn")
    jpath, cpath = d1.value.path(), d2.value.path()
    live_hud = pg.evaluate("([...document.querySelectorAll('#hud .metric-value')].filter(e => e.id !== 'hudReps').map(e => e.textContent).find(t => /\\d/.test(t)) || '—')") if pg.is_visible('#hud') else None
    pg.goto(base + "replay.html")
    pg.set_input_files("#fileInput", files=[{"name": "rec.json", "mimeType": "application/json", "buffer": open(jpath, 'rb').read()}]); pg.wait_for_timeout(500)
    js_summary = pg.inner_text("#summary").replace('\n', ' | '); js_stats = pg.inner_text("#stats").splitlines()[1:3]
    pg.set_input_files("#fileInput", files=[{"name": "rec.csv", "mimeType": "text/csv", "buffer": open(cpath, 'rb').read()}]); pg.wait_for_timeout(500)
    csv_summary = pg.inner_text("#summary").replace('\n', ' | '); csv_stats = pg.inner_text("#stats").splitlines()[1:3]; aspect_vis = pg.is_visible("#aspectRow")
    pg.set_input_files("#fileInput", files=[{"name": "bad.json", "mimeType": "application/json", "buffer": b'{"x":1}'}]); pg.wait_for_timeout(300)
    bad = pg.inner_text("#loadStatus")
    pg.set_input_files("#fileInput", files=[{"name": "bad2.json", "mimeType": "application/json", "buffer": b'not json'}]); pg.wait_for_timeout(300)
    bad2 = pg.inner_text("#loadStatus")
    print(f"[real] JSON summary={js_summary}\n  JSON stats={js_stats}\n  CSV summary={csv_summary}\n  CSV stats={csv_stats} aspectRow={aspect_vis}\n  bad={bad!r} bad2={bad2!r} errors={errs}")
    ctx.close(); b.close()
