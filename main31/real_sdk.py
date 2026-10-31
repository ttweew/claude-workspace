# 10/31 主線：AI 教練用「真的」Firebase AI 程式（fb/node_modules/firebase 的 firebase-app.js、firebase-ai.js，和 gstatic 上的一樣），
# 只把 Gemini 的伺服器（firebasevertexai.googleapis.com）換成假的回答：
#   ok：正常回答 → 總結寫 Gemini 的話；送出去的網址、模型、金鑰、內容（只有數字）
#   disabled：10/31 真的打過一次拿到的 403（Firebase AI Logic API 還沒開）→ 固定句子＋「還沒開通」
#   model404：模型名稱不對（Google 停用了這個模型）→ 固定句子＋「暫時連不上」
# 用法：python3 real_sdk.py <網站資料夾> <port>（假的 MediaPipe 用 ../main30 的 fake_sway）
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
FB = os.path.join(HERE, '..', 'fb', 'node_modules', 'firebase')
FAKE = os.path.join(HERE, '..', 'main30', 'fake_sway')
DISABLED = open(os.path.join(HERE, 'disabled_403.json')).read()
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=FAKE + '.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=FAKE + '.js', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = """(() => {
  const said = window.__said = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { said.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  try { localStorage.setItem('aiCoach', '1'); } catch (e) {}
})();"""
REPLY = '每一下都蹲到位，做得很好。後面三下重心晃得比較多，下次放慢一點。'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for case in ['ok', 'disabled', 'model404']:
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page(); errs = []; sent = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: print('     console', m.type, m.text[:300]) if 'AI 教練' in m.text or m.type == 'error' else None)
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.route("https://www.gstatic.com/firebasejs/12.19.0/*", lambda r: r.fulfill(path=os.path.join(FB, r.request.url.split('/')[-1].split('?')[0]), content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"}))
        # 注意：Playwright 看處理函式有幾個參數，兩個的話第二個會塞 request 進來（10/31 第一次寫成 gemini(route, case=case)，case 被蓋掉）
        def gemini(route):
            req = route.request
            sent.append({'url': req.url, 'key': req.headers.get('x-goog-api-key'), 'body': req.post_data})
            hdr = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}
            if case == 'ok':
                route.fulfill(status=200, headers=hdr, body=json.dumps({'candidates': [{'content': {'role': 'model', 'parts': [{'text': REPLY}]}, 'finishReason': 'STOP'}]}))
            elif case == 'disabled':
                route.fulfill(status=403, headers=hdr, body=DISABLED)
            else:
                route.fulfill(status=404, headers=hdr, body=json.dumps({'error': {'code': 404, 'message': 'models/gemini-3.5-flash-lite is not found for API version v1beta', 'status': 'NOT_FOUND'}}))
        pg.route("https://firebasevertexai.googleapis.com/**", gemini)
        pg.add_init_script(cam_script(640, 480)); pg.add_init_script(INIT)
        pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
        pg.wait_for_function("document.getElementById('hudReps').textContent === '6'", timeout=120000)
        pg.wait_for_timeout(1500); pg.click('#stopBtn')
        pg.wait_for_function("!document.getElementById('coachAdvice').hidden && !document.getElementById('coachStatus').textContent.includes('想一下')", timeout=20000)
        r = pg.evaluate("""() => ({ source: document.getElementById('coachSource').textContent, status: document.getElementById('coachStatus').textContent,
            lines: [...document.querySelectorAll('#coachLines li')].map(li => li.textContent), said: window.__said.filter(t => t.startsWith('教練建議')) })""")
        print('    ', case, json.dumps(r, ensure_ascii=False)[:400])
        if sent: print('     送出：', sent[0]['url'], (sent[0]['body'] or '')[:300])
        check(len(sent) == 1 and '/v1beta/projects/ai-sport-analysis-bf82e/models/gemini-3.5-flash-lite:generateContent' in sent[0]['url'] and sent[0]['key'] == 'AIzaSyDjXfPUrqMDoPlBjQIVPb01GypnbTHqzQI',
              f'{case}：真的 Firebase AI 程式送到 Gemini Developer API（專案、模型、金鑰）')
        body = json.loads(sent[0]['body']) if sent else {}
        text = body.get('contents', [{}])[0].get('parts', [{}])[0].get('text', '')
        check('"動作":"深蹲"' in text and '"次數":6' in text and 'landmark' not in text and 'http' not in text, f'{case}：送出去的只有這組的數字 {text[-160:]}')
        if case == 'ok':
            check(r['source'] == '（AI 教練，Gemini）' and r['lines'] == ['每一下都蹲到位，做得很好。', '後面三下重心晃得比較多，下次放慢一點。'] and r['said'] == ['教練建議：' + REPLY], f'ok：總結寫 Gemini 的話、唸出來 {r}')
        elif case == 'disabled':
            check(r['source'] == '（固定建議）' and '還沒開通' in r['status'] and r['lines'] and len(r['said']) == 1, f'disabled：真的 SDK 認出「還沒開」（api-not-enabled）→ 固定句子＋原因 {r["status"]}')
        else:
            check(r['source'] == '（固定建議）' and '暫時連不上' in r['status'], f'model404：模型不對 → 固定句子 {r["status"]}')
        check(not errs, f'{case}：沒有程式錯誤 {errs[:2]}')
        ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
