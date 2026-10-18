from common import *
import os
PORT=8803; serve("/home/user/claude-workspace", PORT)
with sync_playwright() as p:
    b = launch(p)
    pg = b.new_page(viewport={"width":320,"height":568}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(PERSON_CAM)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(2000)
    # 模擬顯示最長的錯誤訊息
    pg.evaluate("""const s = document.getElementById('poseStatus'); 
      new MutationObserver(() => {}).observe(s, {childList: true});
      window.__long = () => { s.textContent = 'AI 偵測無法使用，請關閉鏡頭再開一次，或重新整理頁面'; s.dataset.kind = 'error'; s.hidden = false; };
      window.__long(); setInterval(window.__long, 5)""")
    pg.click("#perfBtn"); pg.wait_for_timeout(300)
    pg.screenshot(path="r3_long_status.png")
    m = pg.evaluate("""(() => { const r = e => document.getElementById(e).getBoundingClientRect(); return {status: [r('poseStatus').right, r('poseStatus').height], perf: [r('perfBtn').top, r('perfBtn').bottom, r('perfBtn').right], hud: r('hud').top, banner: r('banner').top}; })()""")
    print(m)
    b.close()
