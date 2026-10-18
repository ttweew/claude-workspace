# 模擬手機網路與 CPU，每 0.5 秒記錄首頁載入文字，並截圖幾個時間點
import sys, time, runpy
argv = sys.argv
src = open("measure3.py", encoding="utf-8").read()
src = src.replace("""        for i in range(3):
            pg.wait_for_timeout(1500); shots.append(pg.inner_text("#modelStatus"))
        if run == 0: pg.screenshot(path="home_progress.png")
        print(f"run{run}: 首頁載入過程顯示 {shots}")""", """        tag = sys.argv[3] if len(sys.argv) > 3 else 'x'
        last = None
        while True:
            el = time.time() - t0
            txt = pg.inner_text("#modelStatus")
            if txt != last and run == 0: print(f"  {el:5.1f}s  {txt}"); last = txt
            if run == 0 and int(el*2) in (6, 14, 20, 26): pg.screenshot(path=f"{tag}_{int(el*2)}.png", clip={"x":0,"y":0,"width":390,"height":330})
            if pg.evaluate(READY): break
            pg.wait_for_timeout(500)""")
exec(compile(src, "m4", "exec"))
