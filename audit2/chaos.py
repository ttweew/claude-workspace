# 地基審查：亂按測試。新功能全開（四個動作、錯誤判斷、語音、相似度、校正、運動總結、自動調整、換模型、錄製、驗證記錄），
# 隨機做各種操作，每一步之後檢查：沒有程式錯誤、畫面上沒有 NaN／undefined、次數和秒數的格式對、紀錄每一筆都說得通、
# 錄製中動作鎖住、AI 不會卡在「重新啟動中」
import sys, os, re, json, time, random
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
SEEDS = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else '1,2,3').split(',')]
STEPS = int(sys.argv[3]) if len(sys.argv) > 3 else 60
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8852, ROOT)
ok = True
def check(cond, msg):
    global ok
    if not cond: print('FAIL ' + msg)
    ok = ok and cond
    return cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
BAD_TEXT = r"NaN|undefined|function |\[object |Infinity"
SPY = """window.__said = 0;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak(u) { window.__said++; } } });
  // 模擬切到背景、切回來（真的瀏覽器會停掉畫面；這裡只測網站處理事件的邏輯）
  window.__hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });"""
STATE = """() => {
  const q = s => document.querySelector(s);
  const vis = e => e && !e.hidden && e.offsetParent !== null;
  return {
    open: !q('#stage').hidden,
    recording: q('#recordBtn').classList.contains('recording'),
    reps: q('#hudReps').textContent, repsShown: !q('#hudRepsBox').hidden,
    pose: q('#poseStatus').textContent, model: q('#modelStatus').textContent,
    workout: q('#demoBtnText').textContent,
    tabs: [...document.querySelectorAll('.demo-tabs button')].map(b => [b.dataset.exercise, b.disabled]),
    text: document.body.innerText,
    history: JSON.parse(localStorage.getItem('workoutHistory') || '[]'),
    snaps: JSON.parse(localStorage.getItem('angleSnapshots') || '[]').length
  };
}"""
KIND = {'hold': ['plank'], 'reps': ['squat', 'pushup', 'lunge']}
def valid_session(s):
    try:
        if s['workout'] not in ('squat', 'pushup', 'lunge', 'plank'): return False
        if not (isinstance(s['count'], int) and s['count'] > 0 and isinstance(s['clean'], int) and 0 <= s['clean'] <= s['count']): return False
        if s['workout'] == 'plank': return all(isinstance(x, (int, float)) for x in [s['best'], s['total']]) and s['best'] <= s['total']
        return s['good'] + s['close'] + s['shallow'] == s['count'] and s['best'] <= s['average'] and s['tempo'] > 0 \
            and (s.get('similarity') is None or 0 <= s['similarity'] <= 100)
    except Exception:
        return False

def run(b, seed, kind):
    rnd = random.Random(seed)
    ctx = b.new_context(viewport={"width": rnd.choice([1280, 390, 844]), "height": rnd.choice([800, 844, 390])}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.set_default_timeout(8000)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route("https://storage.googleapis.com/mediapipe-models/**", lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(SPY)
    pg.goto(base + "index.html?workout=" + rnd.choice(['squat', 'pushup', 'plank', 'lunge', 'free']))
    pg.wait_for_function(READY, timeout=60000)
    restarting_since = None
    actions = []
    for step in range(STEPS):
        st = pg.evaluate(STATE)
        choices = []
        if not st['open']:
            choices += ['start'] * 4 + ['voice', 'history', 'advanced_fps', 'advanced_model']
        else:
            choices += ['stop', 'workout', 'workout', 'record', 'record', 'panel', 'snap', 'labels', 'sound', 'fps', 'model', 'hide', 'wait', 'wait', 'wait']
        a = rnd.choice(choices)
        actions.append(a)
        try:
            if a == 'start': pg.click("#startBtn"); pg.wait_for_timeout(rnd.randint(300, 3000))
            elif a == 'stop': pg.click("#stopBtn"); pg.wait_for_timeout(300)
            elif a == 'workout':
                pg.click("#demoBtn"); pg.wait_for_timeout(100)
                tabs = [t for t, d in pg.evaluate("[...document.querySelectorAll('.demo-tabs button')].map(b => [b.dataset.exercise, b.disabled])")]
                target = rnd.choice(tabs)
                pg.evaluate(f"document.querySelector('.demo-tabs button[data-exercise=\"{target}\"]').click()")
                pg.wait_for_timeout(100)
                if not pg.is_hidden("#demoPanel"): pg.evaluate("document.getElementById('demoClose').click()")
                pg.wait_for_timeout(rnd.randint(200, 2500))
            elif a == 'record':
                if pg.is_hidden("#dataPanel"): pg.click("#dataBtn")
                pg.click("#recordBtn"); pg.wait_for_timeout(rnd.randint(100, 1500))
                if rnd.random() < 0.7: pg.click("#dataBtn")
            elif a == 'panel': pg.click("#dataBtn"); pg.wait_for_timeout(200)
            elif a == 'snap':
                if pg.is_hidden("#dataPanel"): pg.click("#dataBtn")
                pg.click("#snapBtn"); pg.wait_for_timeout(200)
            elif a == 'labels': pg.click("#labelBtn")
            elif a == 'sound': pg.click("#soundBtn")
            elif a in ('fps', 'model'):
                if not pg.is_visible("#fpsLive"): pg.click("#perfBtn"); pg.wait_for_timeout(100)
                sel = '#fpsLive' if a == 'fps' else '#modelLive'
                # 只選得到的選項（鏡頭做不到的格數會變灰；錄製中整個選單鎖住）
                opts = pg.evaluate(f"(() => {{ const s = document.querySelector('{sel}'); return s.disabled ? [] : [...s.options].filter(o => !o.disabled).map(o => o.value); }})()")
                if opts: pg.select_option(sel, rnd.choice(opts), timeout=5000)
                pg.wait_for_timeout(rnd.randint(300, 2500))
            elif a == 'hide':
                pg.evaluate("window.__hidden = true; document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(rnd.randint(200, 2000))
                pg.evaluate("window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(300)
            elif a == 'wait': pg.wait_for_timeout(rnd.randint(1000, 4000))
            elif a == 'voice':
                if pg.is_hidden("#voiceToggle"): pg.click("#advanced summary")
                pg.click("#voiceToggle")
            elif a == 'history':
                if pg.is_visible("#historyBox"): pg.click("#historyBox summary")
            elif a in ('advanced_fps', 'advanced_model'):
                if pg.is_hidden("#fpsSelect"): pg.click("#advanced summary")
                sel = '#fpsSelect' if a == 'advanced_fps' else '#modelSelect'
                opts = pg.evaluate(f"(() => {{ const s = document.querySelector('{sel}'); return s.disabled ? [] : [...s.options].filter(o => !o.disabled).map(o => o.value); }})()")
                if opts: pg.select_option(sel, rnd.choice(opts), timeout=5000)
                pg.wait_for_timeout(rnd.randint(200, 1500))
        except Exception as e:
            check(False, f'[{kind} seed {seed} 第 {step} 步 {a}] 操作失敗：{str(e)[:120]}')
        st = pg.evaluate(STATE)
        tag = f'[{kind} seed {seed} 第 {step} 步 {a}]'
        check(not errs, f'{tag} 程式錯誤：{errs[:2]}')
        errs.clear()
        bad = re.findall(BAD_TEXT, st['text'])
        check(not bad, f'{tag} 畫面上有 {bad[:3]}')
        if st['open'] and st['repsShown']:
            check(re.fullmatch(r'\d+|\d+:\d\d', st['reps']) is not None, f'{tag} 次數格式 {st["reps"]!r}')
        check(all(valid_session(s) for s in st['history']), f'{tag} 紀錄 {st["history"][-1:]}')
        if st['recording']:
            names = {'free': '選擇動作', 'squat': '深蹲', 'pushup': '伏地挺身', 'plank': '棒式', 'lunge': '弓箭步'}
            check(all(d == (names[t] != st['workout']) for t, d in st['tabs']), f'{tag} 錄製中動作要鎖住：{st["tabs"]} 目前 {st["workout"]}')
        else:
            check(not any(d for _, d in st['tabs']), f'{tag} 沒在錄製時動作不能鎖住：{st["tabs"]}')
        if '重新啟動中' in st['pose'] or '換成' in st['model']:
            restarting_since = restarting_since or time.time()
            check(time.time() - restarting_since < 15, f'{tag} 卡在「{st["pose"]}」「{st["model"]}」超過 15 秒')
        else:
            restarting_since = None
    st = pg.evaluate(STATE)
    print(f'{kind} seed {seed}：{len(actions)} 步，紀錄 {len(st["history"])} 筆，記下角度 {st["snaps"]} 筆，語音 {pg.evaluate("window.__said")} 次；'
          + '、'.join(f'{k}×{actions.count(k)}' for k in sorted(set(actions))))
    ctx.close()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for seed in SEEDS:
        for k, kind in enumerate(['squat_mix', 'pushup_err', 'plank', 'lunge']):
            run(b, seed * 100 + k, kind)
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
