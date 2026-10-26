# 示範模式的測試影片（容器裡沒有 ffmpeg，Chromium 也不能播 mp4）：在 Chromium 裡用 canvas＋MediaRecorder 錄 WebM
#  moving_<秒>.webm：會動的方塊和秒數（給假的 AI 用，畫面內容不重要，只要是影片、有固定長度）
#  person_6.webm：官方測試照片（mp/pose.jpg，一個人站著）放 6 秒（給真的 AI：看得到人、畫出骨架）
# 用法：python3 make_videos.py
import os, sys, base64
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
JPG = base64.b64encode(open(os.path.join(HERE, '..', 'mp', 'pose.jpg'), 'rb').read()).decode()
REC = """async ({ seconds, photo }) => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const g = c.getContext('2d');
  let img = null;
  if (photo) { img = new Image(); img.src = 'data:image/jpeg;base64,' + photo; await img.decode(); }
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
  const parts = []; rec.ondataavailable = e => parts.push(e.data);
  const t0 = performance.now(); let raf;
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    if (img) { g.drawImage(img, 0, 0, 640, 480); }
    else { g.fillStyle = '#123'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#4CC3FF'; g.fillRect(40 + (t * 80) % 520, 200, 80, 80); g.fillStyle = '#fff'; g.font = '48px sans-serif'; g.fillText(t.toFixed(1) + ' s', 40, 80); }
    raf = requestAnimationFrame(draw);
  };
  draw(); rec.start(500);
  await new Promise(r => setTimeout(r, seconds * 1000));
  rec.stop(); cancelAnimationFrame(raf);
  await new Promise(r => rec.onstop = r);
  const buf = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); pg.goto('about:blank')
    for name, sec, photo in [('moving_3', 3, None), ('moving_22', 22, None), ('person_6', 6, JPG)]:
        data = base64.b64decode(pg.evaluate(REC, {'seconds': sec, 'photo': photo}))
        open(os.path.join(HERE, name + '.webm'), 'wb').write(data)
        print(name, len(data), 'bytes')
    b.close()
