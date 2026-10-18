from common import *
PORT=8808; serve("/home/user/claude-workspace", PORT)
with sync_playwright() as p:
    b = launch(p)
    pg,errs,logs = page(b, PORT, gpu=False, vw=568, vh=320)
    pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#labelBtn"); pg.click("#dataBtn"); pg.wait_for_timeout(500)
    print(pg.evaluate("""(() => { const d = document.getElementById('dataPanel'); const cs = getComputedStyle(d);
      const hits = [...document.querySelectorAll('.joint-label:not([hidden])')].map(l => { const r = l.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return l.textContent + ':' + (e && (e.closest('#dataPanel') ? 'panel' : e.className)); });
      return [cs.backgroundColor, cs.opacity, cs.zIndex, hits]; })()"""))
    b.close()
