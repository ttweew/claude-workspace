import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8872)
SRC = open('/home/user/claude-workspace/js/ai/pose-worker.js', encoding='utf-8').read()
FAKE_GPU = """for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const o = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : o.call(this, p); }; }"""
cases = [
    ('背景不能用 GPU → 主畫面 GPU', lambda r: r.fulfill(body=SRC.replace("self.postMessage({ type: 'hello', webgl: supportsWebGL() });", "self.postMessage({ type: 'hello', webgl: false });"), content_type='text/javascript'), 'GPU', 0),
    ('背景執行緒檔案載入失敗 → 主畫面', lambda r: r.fulfill(status=404, body='not found'), 'GPU', 0),
    ('背景建立 GPU 失敗 → 背景 CPU', lambda r: r.fulfill(body=SRC.replace("const canvas = delegate === 'GPU' ? new OffscreenCanvas(1, 1) : null;", "if (delegate === 'GPU') throw new Error('模擬 GPU 建立失敗'); const canvas = null;"), content_type='text/javascript'), 'CPU', 1),
    ('瀏覽器不支援 Worker → 主畫面', None, 'GPU', 0),
]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, handler, expect_mode, expect_workers in cases:
        pg = b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        mock_network(pg); pg.add_init_script(cam_script(640, 480) + FAKE_GPU + ("window.Worker = undefined;" if handler is None else ''))
        if handler: pg.route("**/js/ai/pose-worker.js*", handler)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=120000)
        pg.click('#startBtn'); pg.wait_for_timeout(7000); pg.click('#perfBtn'); pg.wait_for_timeout(200)
        perf = pg.inner_text('#perfBtn'); st = pg.inner_text('#poseStatus')
        good = perf.startswith(expect_mode) and st == '已偵測到全身' and len(pg.workers) == expect_workers and not errs
        print(('PASS ' if good else 'FAIL ') + name + f' | {perf} | {st} | 背景執行緒 {len(pg.workers)} | errors {errs}')
        pg.close()
    b.close()
