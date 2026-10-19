# 把錄製檔的原始骨架每隔 step 秒畫一格，排成大圖（只畫骨架，看教練在做什麼動作）
import json, sys
from PIL import Image, ImageDraw
f, t0, t1, step, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
d = json.load(open(f))
W, H = d['meta']['videoWidth'], d['meta']['videoHeight']
fr = d['frames']
EDGES = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28),(27,29),(29,31),(27,31),(28,30),(30,32),(28,32),(0,11),(0,12)]
pw, ph = 120, 160
times = []
t = t0
while t <= t1 + 1e-6: times.append(t); t += step
cols = 10; rows = (len(times) + cols - 1) // cols
img = Image.new('RGB', (cols * pw, rows * (ph + 14)), 'white')
dr = ImageDraw.Draw(img)
j = 0
for k, t in enumerate(times):
    while j + 1 < len(fr) and fr[j + 1]['t'] / 1000 <= t: j += 1
    x0, y0 = (k % cols) * pw, (k // cols) * (ph + 14)
    dr.rectangle([x0, y0, x0 + pw - 1, y0 + ph - 1], outline=(200, 200, 200))
    dr.text((x0 + 3, y0 + ph), f'{t:.1f}s', fill='black')
    lm = fr[j].get('landmarks')
    if abs(fr[j]['t'] / 1000 - t) > 0.2 or not lm:
        dr.text((x0 + 40, y0 + 70), 'no', fill='red'); continue
    P = [(x0 + p[0] * pw, y0 + p[1] * ph, p[3]) for p in lm]
    for a, b in EDGES:
        good = P[a][2] > 0.5 and P[b][2] > 0.5
        col = ((0, 90, 200) if a % 2 == 1 or b in (0,) else (200, 60, 0)) if good else (210, 210, 210)
        if a in (11, 13, 15, 23, 25, 27, 29, 31) and b in (13, 15, 25, 27, 29, 31): col = (0, 90, 200) if good else (210, 210, 210)
        if a in (12, 14, 16, 24, 26, 28, 30, 32) and b in (14, 16, 26, 28, 30, 32): col = (200, 60, 0) if good else (210, 210, 210)
        dr.line([P[a][:2], P[b][:2]], fill=col, width=2)
    dr.ellipse([P[0][0] - 3, P[0][1] - 3, P[0][0] + 3, P[0][1] + 3], fill=(0, 150, 0))
img.save(out)
print(out, img.size)
