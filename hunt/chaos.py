# 亂按壓力測試：深蹲模式 + 假 AI 一直播放深蹲，隨機操作 200 步，每步檢查狀態
import sys, os, random
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8857)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    if rel == '/vision_bundle.mjs': route.fulfill(path=HERE + "/fake_loop.mjs", content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    elif rel == '/vision_bundle.js': route.fulfill(path='/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/worker/fake_loop.js', content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
TWO_CAMS = """
window.__streams = [];
navigator.mediaDevices.enumerateDevices = async () => [
  { kind: 'videoinput', deviceId: 'front', label: '前置鏡頭', groupId: 'a' },
  { kind: 'videoinput', deviceId: 'back', label: '後置鏡頭', groupId: 'b' }];
navigator.mediaDevices.getUserMedia = async (c) => {
  await new Promise(r => setTimeout(r, 30 + Math.random() * 150));
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d');
  setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random() * 999).toString().padStart(3, '0'); g.fillRect(0, 0, 4, 4); }, 33);
  const s = cv.captureStream(30);
  const want = c && c.video && c.video.deviceId && (c.video.deviceId.exact || c.video.deviceId);
  const id = want || 'front';
  const t = s.getVideoTracks()[0];
  t.getSettings = () => ({ deviceId: id, facingMode: id === 'front' ? 'user' : 'environment', width: 640, height: 480 });
  t.getCapabilities = () => ({ facingMode: [id === 'front' ? 'user' : 'environment'] });
  window.__streams.push(s); return s;
};"""
CHECK = """(() => {
  const live = window.__streams.filter(s => s.getVideoTracks().some(t => t.readyState === 'live')).length;
  const stage = !document.getElementById('stage').hidden;
  const panel = !document.getElementById('dataPanel').hidden;
  const toast = !document.getElementById('repToast').hidden;
  const banner = !document.getElementById('banner').hidden;
  const hud = document.getElementById('hud');
  const problems = [];
  if (live > 1) problems.push('同時開著 ' + live + ' 個鏡頭');
  if (!stage && live > 0) problems.push('回到首頁但鏡頭沒關');
  if (panel && toast) problems.push('數據面板打開時還顯示每一下的提示');
  if (toast && banner) problems.push('提示和橫幅同時出現');
  if (panel && !hud.hidden) problems.push('數據面板和儀表板同時出現');
  if (!stage && document.getElementById('hudReps').textContent !== '0') problems.push('關閉鏡頭後次數沒歸零：' + document.getElementById('hudReps').textContent);
  return { problems, live, stage, panel, reps: document.getElementById('hudReps').textContent };
})()"""
random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn)
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.add_init_script("try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}")
    pg.add_init_script(TWO_CAMS)
    pg.goto(base + "index.html?lab=squat" + ('&worker=0' if len(sys.argv) > 2 and sys.argv[2] == 'main' else '')); pg.wait_for_function(READY, timeout=60000)
    actions = ['open', 'close', 'switch', 'panel', 'labels', 'record', 'tap', 'wait', 'wait', 'wait', 'fullscreen', 'perf']
    log = []; problems = []; max_reps = 0
    for step in range(200):
        a = random.choice(actions)
        stage = pg.evaluate("!document.getElementById('stage').hidden")
        try:
            if a == 'open' and not stage: pg.click('#startBtn', timeout=2000)
            elif a == 'close' and stage: pg.click('#stopBtn', timeout=2000)
            elif a == 'switch' and stage and pg.is_visible('#cameraSelect'):
                pg.select_option('#cameraSelect', random.choice(['front', 'back']), timeout=2000)
            elif a == 'panel' and stage: pg.click('#dataBtn', timeout=2000)
            elif a == 'labels' and stage: pg.click('#labelBtn', timeout=2000)
            elif a == 'record' and stage and pg.is_visible('#recordBtn'): pg.click('#recordBtn', timeout=2000)
            elif a == 'tap' and stage: pg.mouse.click(random.randint(20, 370), random.randint(200, 700))
            elif a == 'fullscreen' and stage and pg.is_visible('#fullscreenBtn'): pg.click('#fullscreenBtn', timeout=2000)
            elif a == 'perf' and stage and pg.is_visible('#perfBtn'): pg.click('#perfBtn', timeout=2000)
            elif a == 'wait': pg.wait_for_timeout(random.choice([100, 500, 1500, 3000]))
        except Exception as e:
            diag = pg.evaluate("""(() => { const b = document.getElementById('startBtn'); const r = b.getBoundingClientRect();
              const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return { inert: document.querySelector('.page').inert, stageHidden: document.getElementById('stage').hidden, fs: !!document.fullscreenElement,
                btn: [Math.round(r.top), Math.round(r.bottom)], scrollY: scrollY, innerH: innerHeight, at: e && (e.id || e.tagName + '.' + e.className), disabled: b.disabled }; })()""")
            log.append(f'{step}:{a} 操作失敗 {str(e).splitlines()[0][:50]} {diag}')
            pg.screenshot(path=f'{HERE}/chaos_fail_{step}.png')
        pg.wait_for_timeout(random.randint(0, 120))
        st = pg.evaluate(CHECK)
        max_reps = max(max_reps, int(st['reps']))
        for pr in st['problems']:
            problems.append(f'{step}:{a} {pr}')
    print('seed', sys.argv[1] if len(sys.argv) > 1 else 1, '| 問題', len(problems), problems[:8], '| 操作失敗', log[:5], '| 最多次數', max_reps, '| errors', errs[:5])
    b.close()
