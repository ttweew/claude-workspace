import sys
from common import *
root, PORT = sys.argv[1], int(sys.argv[2]); serve(root, PORT)
with sync_playwright() as p:
    b = launch(p)
    for case in ["model", "cdn"]:
        pg = b.new_page(viewport={"width":1280,"height":720})
        n = {"c": 0}
        def model(r):
            n["c"] += 1
            if case == "model" and n["c"] == 1: return r.abort("connectionreset")
            r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"})
        m = {"c": 0}
        def cdn2(r):
            if r.request.url.split("?")[0].endswith("vision_bundle.mjs"):
                m["c"] += 1
                if case == "cdn" and m["c"] <= 2: return r.abort("internetdisconnected")
            cdn(r)
        pg.route(CDN+"/**", cdn2)
        pg.route("https://unpkg.com/**", lambda r: r.abort("internetdisconnected") if m["c"] <= 2 else r.fulfill(path=PKG + r.request.url.split("tasks-vision@1.0.1")[1].split("?")[0], content_type="text/javascript", headers={"Access-Control-Allow-Origin":"*"}))
        pg.route("https://storage.googleapis.com/**", model)
        pg.add_init_script(PERSON_CAM)
        seen = []
        pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        for i in range(25):
            pg.wait_for_timeout(1000)
            t = pg.inner_text("#modelStatus")
            if not seen or seen[-1] != t: seen.append(t)
            if "已就緒" in t: break
        print(case, "| 斷線一次後：", " → ".join(seen))
        pg.close()
    b.close()
