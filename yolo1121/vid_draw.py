# 同一格畫 MediaPipe（綠：右側、藍：左側）和 YOLO（右側紅、左側黃），看左右、髖的位置差在哪
import json, sys
from PIL import Image, ImageDraw
S = sys.argv[1]; frames = [int(x) for x in sys.argv[2].split(',')]; out = sys.argv[3]
mp = json.load(open(S + '/vidout/mediapipe-lite.json')); yo = json.load(open(S + '/vidout/yolo26n-pose-320.json'))
W, H = mp['size']
MP = {'R': [12, 14, 16, 24, 26, 28], 'L': [11, 13, 15, 23, 25, 27]}
YO = {'R': [6, 8, 10, 12, 14, 16], 'L': [5, 7, 9, 11, 13, 15]}
chain = [(0, 1), (1, 2), (0, 3), (3, 4), (4, 5)]  # 肩-肘-腕、肩-髖-膝-踝
tiles = []
for fi in frames:
    im = Image.open(f'{S}/frames/pu_{fi:03d}.png').convert('RGB'); d = ImageDraw.Draw(im)
    m = mp['frames'][fi]['r']; y = yo['frames'][fi]['r']['k']
    for side, col in (('R', (0, 200, 0)), ('L', (60, 120, 255))):
        p = [(m[i][0] * W, m[i][1] * H) for i in MP[side]]
        for a, b in chain: d.line([p[a], p[b]], fill=col, width=3)
    for side, col in (('R', (255, 40, 40)), ('L', (255, 200, 0))):
        p = [(y[i][0] * W, y[i][1] * H) for i in YO[side]]
        for a, b in chain: d.line([p[a], p[b]], fill=col, width=2)
        for q in p: d.ellipse([q[0] - 3, q[1] - 3, q[0] + 3, q[1] + 3], fill=col)
    tiles.append(im.crop((80, 120, 560, 360)))
w, h = tiles[0].size; canvas = Image.new('RGB', (w, h * len(tiles)))
for i, t in enumerate(tiles): canvas.paste(t, (0, i * h))
canvas.save(out); print(out, canvas.size)
