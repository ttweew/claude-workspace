import sys, os, time
sys.path.insert(0, '..')
exec(open('freeze.py').read().split("with sync_playwright() as p:")[0])
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx, pg = page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(5000)
    pg.evaluate("window.__noPlay = true; window.__noAutoplay = true; document.getElementById('video').pause()")
    t0 = time.time(); last = None
    while time.time() - t0 < 32:
        s = pg.inner_text("#poseStatus")
        rs = pg.evaluate("document.getElementById('video').readyState"); op = pg.evaluate("window.__opens")
        if s != last: print('%5.1fs status: %s | opens %s | readyState %s' % (time.time()-t0, s, op, rs)); last = s
        pg.wait_for_timeout(250)
    print('\n'.join(l for l in pg.logs if 'AI' in l or '鏡頭' in l or 'rror' in l)[:3000])
    b.close()
