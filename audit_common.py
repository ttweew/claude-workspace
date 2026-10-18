import sys as _s; _s.path.insert(0, "/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad"); import swroute
import http.server, threading, functools
MP = "/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/mp"
PKG = MP + "/node_modules/@mediapipe/tasks-vision"
CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(port, directory="/home/user/claude-workspace"):
    Q.extensions_map[".js"] = "text/javascript"
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Q, directory=directory))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}/"
def cdn(route):
    f = PKG + route.request.url[len(CDN):].split("?")[0]
    route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
def mock_network(pg):
    pg.route(CDN + "/**", cdn)
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
# 模擬鏡頭：把全身照片等比例放進 w×h 的畫面（直式或橫式）
# 舊測試按「開始錄製」要馬上開始錄：關掉錄製前倒數（倒數另外在 r9/countdown.py 測）
NO_COUNTDOWN = "try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}"
def cam_script(w, h):
    return NO_COUNTDOWN + """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = %d; c.height = %d;
  const g = c.getContext('2d'); const s = Math.min(c.width / im.width, c.height / im.height);
  const dw = im.width * s, dh = im.height * s;
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh); };
  draw(); setInterval(draw, 33);
  return c.captureStream(30);
};""" % (w, h)
READY = "(() => { const t = document.getElementById('poseStatus').textContent; return t.includes('已就緒') || t.includes('失敗'); })()"
