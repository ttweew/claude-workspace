import sys
sys.path.insert(0, '../stab')
from common import *
serve("/home/user/claude-workspace", 8870)
with sync_playwright() as p:
    b = launch(p); pg = b.new_page(); urls = []
    pg.route(CDN+"/**", cdn)
    def m(r):
        urls.append(r.request.url.split('/')[-1]); f = SP + "/ghost2/pose_landmarker_full.task" if 'full' in r.request.url else MP + "/pose_landmarker_lite.task"
        r.fulfill(path=f, headers={"Access-Control-Allow-Origin":"*"})
    pg.route("https://storage.googleapis.com/**", m)
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(PERSON_CAM)
    pg.goto("http://127.0.0.1:8870/index.html?model=full")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(4000)
    print(urls, pg.inner_text("#poseStatus"), pg.inner_text("#perfBtn"))
    b.close()
