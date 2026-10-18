from common import *
PORT=8806; serve("/home/user/claude-workspace", PORT)
with sync_playwright() as p:
    b = launch(p)
    pg = b.new_page(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    st = {"off": True}
    pg.route(CDN+"/**", lambda r: r.abort("internetdisconnected") if st["off"] else cdn(r))
    pg.route("https://unpkg.com/**", lambda r: r.abort("internetdisconnected"))
    pg.route("https://storage.googleapis.com/**", lambda r: r.abort("internetdisconnected") if st["off"] else r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(PERSON_CAM)
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_timeout(1000); pg.screenshot(path="r2_retry_home.png")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('請檢查網路')", timeout=30000)
    print("全部失敗：", pg.inner_text("#modelStatus"), "| 進度條隱藏", pg.evaluate("document.getElementById('modelProgress').hidden"))
    pg.click("#startBtn"); pg.wait_for_timeout(1500)
    print("沒 AI 也能開鏡頭：", pg.is_visible("#stage"), pg.inner_text("#poseStatus"), "| 焦點", pg.evaluate("document.activeElement.id"), "| 首頁 inert", pg.evaluate("document.querySelector('.page').inert"))
    st["off"] = False
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('全身')", timeout=30000)
    print("網路恢復後：", pg.inner_text("#poseStatus"), pg.inner_text("#perfBtn"))
    order = []
    for i in range(7):
        pg.keyboard.press("Tab"); order.append(pg.evaluate("document.activeElement.id || document.activeElement.tagName"))
    print("Tab 順序：", order)
    pg.focus("#stopBtn"); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    print("關閉後焦點：", pg.evaluate("document.activeElement.id"), "| inert", pg.evaluate("document.querySelector('.page').inert"), errs)
    b.close()
