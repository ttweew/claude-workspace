from common import *
OUT = SP + "/report/img/"
serve("/home/user/claude-workspace", 8881)
with sync_playwright() as p:
    b = launch(p)
    pg,errs,logs = page(b, 8881, gpu=False, vw=1280, vh=720)
    pg.click("#startBtn"); pg.wait_for_timeout(4000)
    pg.click("#perfBtn"); pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT+"q1_perf.png")
    pg.click("#perfBtn"); pg.click("#labelBtn"); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT+"q3_labels.png")
    pg.click("#labelBtn"); pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(3000)
    pg.screenshot(path=OUT+"q56_data.png")
    print(errs)
    b.close()
