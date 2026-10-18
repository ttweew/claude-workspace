import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8863)
FAKE_GPU = """for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const o = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : o.call(this, p); }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for q, gpu in [('', False), ('?worker=0', False), ('', True), ('?worker=0', True), ('?cpu', False)]:
        pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []; logs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.on("console", lambda m: logs.append(m.type + ':' + m.text[:150]) if m.type in ('error', 'warning', 'info') and 'W1002' not in m.text and 'GL Driver' not in m.text and 'XNNPACK' not in m.text and 'gl_context' not in m.text and 'inference_feedback' not in m.text and 'landmark_projection' not in m.text else None)
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        if gpu: pg.add_init_script(FAKE_GPU)
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=90000)
        st = pg.inner_text('#modelStatus')
        pg.click('#startBtn'); pg.wait_for_timeout(5000)
        pg.click('#perfBtn'); pg.wait_for_timeout(300)
        hud_val = pg.evaluate("([...document.querySelectorAll('#hud .metric-value')].filter(e => e.id !== 'hudReps').map(e => e.textContent).find(t => /\\d/.test(t)) || '—')")
        print(f"[{q or 'default'} gpu={gpu}] {st} | {pg.inner_text('#poseStatus')} | HUD {hud_val} | {pg.inner_text('#perfBtn')} | workers {len(pg.workers)} | errors {errs}")
        for l in logs[:4]: print('    ', l)
        pg.close()
    b.close()
