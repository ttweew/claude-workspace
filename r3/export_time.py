import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8893)
JS = """async () => {
  const { PoseRecorder } = await import('./js/data/recorder.js');
  const r = new PoseRecorder(); r.start({});
  const pts = Array.from({length: 33}, (_, i) => ({x: Math.random(), y: Math.random(), z: Math.random()-0.5, visibility: Math.random()}));
  const w = pts.map(p => ({x: p.x - .5, y: p.y - .5, z: p.z}));
  for (let i = 0; i < 9000; i++) r.add(i * 33.3, pts, w);
  const out = {};
  let t = performance.now(); const csv = r.toCSV(); out.csv = performance.now() - t; out.csvMB = csv.length / 1e6;
  t = performance.now(); const json = r.toJSON(); out.json = performance.now() - t; out.jsonMB = json.length / 1e6;
  t = performance.now(); new Blob([json]); out.blob = performance.now() - t;
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); pg.goto(base + "replay.html")
    for rate in (1, 4, 6):
        cdp = pg.context.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': rate})
        print(rate, 'x', pg.evaluate(JS))
    b.close()
