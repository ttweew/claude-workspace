# 模擬手機網路（10 Mbps、延遲 60ms）與中階手機 CPU（慢 4 倍），量測 AI 模型載入時間
import http.server, threading, functools, os, sys, time
from playwright.sync_api import sync_playwright
ROOT = "/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/throttle"
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "public, max-age=3600"); super().end_headers()
    def send_head(self):
        path = self.translate_path(self.path.split("?")[0])
        if os.path.exists(path + ".gz") and "gzip" in self.headers.get("Accept-Encoding", ""):
            f = open(path + ".gz", "rb"); size = os.fstat(f.fileno()).st_size
            self.send_response(200)
            self.send_header("Content-Type", "application/wasm" if path.endswith(".wasm") else "text/javascript")
            self.send_header("Content-Encoding", "gzip"); self.send_header("Content-Length", str(size))
            self.end_headers(); return f
        return super().send_head()
H.extensions_map[".mjs"] = "text/javascript"; H.extensions_map[".wasm"] = "application/wasm"
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8773), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
import shutil
site = os.path.dirname(sys.argv[1])
for d in ("js", "css"):
    shutil.rmtree(ROOT + "/" + d, ignore_errors=True)
    if os.path.isdir(site + "/" + d): shutil.copytree(site + "/" + d, ROOT + "/" + d)
def local(src):
    src = src.replace("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1", "http://127.0.0.1:8773/cdn")
    return src.replace("https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", "http://127.0.0.1:8773/model/pose_landmarker_lite.task")
open(ROOT + "/index.html", "w", encoding="utf-8").write(local(open(sys.argv[1], encoding="utf-8").read()))
if os.path.exists(ROOT + "/js/config.js"):
    cfg = local(open(ROOT + "/js/config.js", encoding="utf-8").read())
    open(ROOT + "/js/config.js", "w", encoding="utf-8").write(cfg)
CAM = """navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im,0,0); setInterval(() => g.drawImage(im, 0, 0), 33);
  return c.captureStream(30); };"""
READY = "(() => { const t = document.getElementById('poseStatus').textContent; return t.includes('已就緒') || t.includes('失敗'); })()"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for run in range(int(sys.argv[2]) if len(sys.argv) > 2 else 3):
        ctx = b.new_context(viewport={"width": 390, "height": 844})
        pg = ctx.new_page(); pg.add_init_script(CAM)
        cdp = ctx.new_cdp_session(pg)
        cdp.send("Network.enable")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 60, "downloadThroughput": 10e6 / 8, "uploadThroughput": 5e6 / 8})
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        reqs = []
        pg.on("console", lambda m: print("  console:", m.type, m.text[:200]) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: print("  pageerror:", str(e)[:200]))
        pg.on("response", lambda r: print("  404:", r.url) if r.status == 404 else None)
        pg.on("requestfailed", lambda r: print("  requestfailed:", r.url, r.failure))
        pg.on("request", lambda r: reqs.append(r.url.split("/")[-1]))
        t0 = time.time(); pg.goto("http://127.0.0.1:8773/index.html")
        shots = []
        for i in range(3):
            pg.wait_for_timeout(1500); shots.append(pg.inner_text("#modelStatus"))
        if run == 0: pg.screenshot(path="home_progress.png")
        print(f"run{run}: 首頁載入過程顯示 {shots}")
        pg.wait_for_function(READY, timeout=40000, polling=50); t_ready = time.time() - t0
        status = pg.inner_text("#poseStatus")
        t1 = time.time(); pg.click("#startBtn")
        pg.wait_for_function("document.getElementById('poseStatus').textContent === '已偵測到全身'", timeout=60000, polling=20)
        t_first = time.time() - t1
        big = {n: reqs.count(n) for n in set(reqs) if n.endswith((".wasm", ".task"))}
        big["頁面檔案數"] = len([n for n in set(reqs) if n.endswith((".html", ".css", ".js")) and "wasm" not in n])
        pg.wait_for_timeout(500)
        # 第二次打開（同一個瀏覽器，檔案已經存在瀏覽器快取裡）
        reqs.clear(); t2 = time.time(); pg.goto("http://127.0.0.1:8773/index.html")
        pg.wait_for_function(READY, timeout=40000, polling=50); t_second = time.time() - t2
        print(f"run{run}: 第二次打開模型就緒 {t_second:.1f}s，狀態「{pg.inner_text('#modelStatus')}」")
        print(f"run{run}: 模型就緒 {t_ready:.1f}s | 按開啟鏡頭到出現骨架 {t_first:.2f}s | 狀態「{status}」 | 下載次數 {big}")
        ctx.close()
    b.close()
