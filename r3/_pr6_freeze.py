import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8894 + 1000, '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-pr6')
JS = """async (kind) => {
  const { PoseRecorder, buildFile } = await import('./js/data/recorder.js');
  const r = new PoseRecorder(); r.start({});
  const pts = Array.from({length: 33}, () => ({x: Math.random(), y: Math.random(), z: Math.random()-0.5, visibility: Math.random()}));
  const w = pts.map(p => ({x: p.x - .5, y: p.y - .5, z: p.z}));
  for (let i = 0; i < 9000; i++) r.add(i * 33.3, pts, w);
  // 量主執行緒最久停住多久：每 5 ms 打一次點
  let last = performance.now(), worst = 0; const iv = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; }, 5);
  await new Promise(r => setTimeout(r, 50)); worst = 0; last = performance.now();
  const t = performance.now();
  if (kind === 'old') { const s = r.toJSON(); new Blob([s]); } else await buildFile(r.jsonChunks(), 'application/json');
  const total = performance.now() - t;
  await new Promise(r => setTimeout(r, 30)); clearInterval(iv);
  return { total: Math.round(total), worstFreeze: Math.round(worst) };
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); pg.goto(base + "replay.html")
    cdp = pg.context.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    for k in ('old', 'new'): print(k, pg.evaluate(JS, k))
    b.close()
