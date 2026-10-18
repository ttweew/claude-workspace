# 模擬下載卡住：確認會自動重試、不會誤判
import sys, time, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
UNPKG = "https://unpkg.com/@mediapipe/tasks-vision@1.0.1"
base = serve(8790, sys.argv[2] if len(sys.argv) > 2 else "/home/user/claude-workspace")

# 在網頁程式之前接手 fetch：依設定讓某一次下載停住（或變慢、暫停一段時間）
STALL_JS = """
window.__cfg = %s;
window.__log = [];
const hist = [];
window.__hist = hist;
const real = window.fetch;
const counts = { model: 0, engine: 0 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
window.__stallFetch = async (input, init) => {
  const url = String(input && input.url || input);
  const kind = url.includes('.task') ? 'model' : url.endsWith('.wasm') ? 'engine' : null;
  if (!kind) return real(input, init);
  const n = counts[kind]++;
  const cfg = window.__cfg[kind];
  __log.push(kind + ' fetch #' + n + ' signal=' + !!(init && init.signal));
  let res;
  try { res = await real(input, init); } catch (e) { __log.push(kind + ' #' + n + ' rejected ' + e.name); throw e; }
  if (!cfg || !(cfg.on || [0]).includes(n)) return res;
  const signal = init && init.signal;
  const reader = res.body.getReader();
  let sent = 0, paused = false, pending = null;
  const body = new ReadableStream({
    async pull(c) {
      if (cfg.stallAfter !== undefined && sent >= cfg.stallAfter) {
        __log.push(kind + ' #' + n + ' stalled at ' + sent);
        await new Promise((_, rej) => {
          if (!signal) return;
          signal.addEventListener('abort', () => { __log.push(kind + ' #' + n + ' aborted'); rej(new DOMException('aborted', 'AbortError')); });
        });
      }
      if (cfg.pauseAfter !== undefined && !paused && sent >= cfg.pauseAfter) {
        paused = true; __log.push(kind + ' #' + n + ' pause ' + cfg.pauseMs + 'ms at ' + sent);
        await sleep(cfg.pauseMs);
        __log.push(kind + ' #' + n + ' resumed');
      }
      if (!pending || pending.length === 0) {
        const { done, value } = await reader.read();
        if (done) { c.close(); return; }
        pending = value;
      }
      const size = cfg.piece || pending.length;
      const piece = pending.subarray(0, size); pending = pending.subarray(size);
      if (cfg.pieceMs) await sleep(cfg.pieceMs);
      sent += piece.length; c.enqueue(piece);
    }
  });
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
};
window.fetch = window.__stallFetch;
if (window.__cfg.hidden) {
  window.__hidden = true;
  Object.defineProperty(Document.prototype, 'hidden', { get() { return window.__hidden; } });
}
new MutationObserver(() => {
  const el = document.getElementById('modelStatus');
  if (el && hist[hist.length - 1] !== el.textContent) hist.push(((performance.now() / 1000).toFixed(1)) + 's ' + el.textContent);
}).observe(document, { subtree: true, childList: true, characterData: true });
"""

FAKE_GPU = """
for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
  const orig = C.prototype.getParameter;
  C.prototype.getParameter = function (p) { return p === 0x9246 ? 'Adreno (TM) 740' : orig.call(this, p); };
}"""
def run(b, name, cfg, hang=None, expect_retry=False, timeout=90, gpu=False):
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    console = []
    pg.on("console", lambda m: console.append(m.type + ': ' + m.text[:160]) if m.type in ('error', 'warning') else None)
    hung = []
    def cdn_route(prefix):
        def h(route):
            url = route.request.url
            if hang and hang(url):
                hung.append(url); return  # 不回應：模擬下載來源沒反應
            f = PKG + url[len(prefix):].split("?")[0]
            route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
        return h
    pg.route(CDN + "/**", cdn_route(CDN))
    pg.route(UNPKG + "/**", cdn_route(UNPKG))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(STALL_JS % json.dumps(cfg) + cam_script(640, 480) + (FAKE_GPU if gpu else ''))
    t0 = time.time()
    pg.goto(base + "index.html" + __import__("os").environ.get("QUERY", ""))
    if cfg.get("hidden"):
        pg.wait_for_timeout(cfg["hidden"])
        pg.evaluate("window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('已就緒') || document.getElementById('modelStatus').textContent.includes('請檢查網路')", timeout=timeout * 1000)
    elapsed = time.time() - t0
    final = pg.inner_text("#modelStatus")
    hist = pg.evaluate("window.__hist")
    retried = any('重試' in h for h in hist)
    fetch_ok = pg.evaluate("window.fetch === window.__stallFetch")
    # 確認真的能偵測：開鏡頭等骨架
    detect = None
    if '已就緒' in final:
        pg.click("#startBtn")
        try:
            pg.wait_for_function("!!document.querySelector('#hud') && !document.getElementById('hud').hidden && /\\d/.test(([...document.querySelectorAll('#hud .metric-value')].filter(e => e.id !== 'hudReps').map(e => e.textContent).find(t => /\\d/.test(t)) || '—'))", timeout=15000)
            detect = pg.evaluate("([...document.querySelectorAll('#hud .metric-value')].filter(e => e.id !== 'hudReps').map(e => e.textContent).find(t => /\\d/.test(t)) || '—')")
        except Exception as e:
            detect = 'FAIL ' + pg.inner_text('#poseStatus')
    good = '已就緒' in final and retried == expect_retry and fetch_ok and not errs and detect and not str(detect).startswith('FAIL')
    perf = pg.inner_text('#perfBtn') if pg.is_visible('#perfBtn') else ''
    print(f"{'PASS' if good else 'FAIL'} [{name}] perf={perf!r} {elapsed:.1f}s final={final!r} retried={retried} fetchRestored={fetch_ok} detect={detect!r}")
    print("   status:", hist)
    print("   log:", pg.evaluate("window.__log"))
    if hung: print("   hung:", [h.split('/')[-1] for h in hung])
    if errs: print("   pageerrors:", errs)
    for c in console[:8]: print("   ", c)
    ctx.close()
    return good

only = sys.argv[1] if len(sys.argv) > 1 else 'all'
S = {
  'normal':  dict(cfg={}, ),
  'model':   dict(cfg={"model": {"stallAfter": 1000000, "piece": 65536}}, expect_retry=True),
  'engine':  dict(cfg={"engine": {"stallAfter": 2000000, "piece": 65536}}, expect_retry=True),
  'import':  dict(cfg={}, hang=lambda u: u.startswith(CDN) and u.split('?')[0].endswith('vision_bundle.mjs')),
  'loader':  dict(cfg={}, expect_retry=True, hang=lambda u: u.startswith(CDN) and u.endswith('vision_wasm_internal.js') and not hasattr(run, 'loaded') and not setattr(run, 'loaded', 1)),
  'slow':    dict(cfg={"model": {"piece": 65536, "pieceMs": 250, "pauseAfter": 2000000, "pauseMs": 10000}}),
  'hidden':  dict(cfg={"model": {"pauseAfter": 1000000, "pauseMs": 25000}, "hidden": 24000}),
  'gpu_model':  dict(cfg={"model": {"stallAfter": 1000000, "piece": 65536}}, expect_retry=True, gpu=True),
  'gpu_engine': dict(cfg={"engine": {"stallAfter": 2000000, "piece": 65536}}, expect_retry=True, gpu=True),
  'gpu_normal': dict(cfg={}, gpu=True),
  'twice':   dict(cfg={"model": {"stallAfter": 500000, "piece": 65536, "on": [0, 1]}}, expect_retry=True),
}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    res = {}
    for k, v in S.items():
        if only != 'all' and k not in only.split(','): continue
        res[k] = run(b, k, **v)
    b.close()
print(res)
