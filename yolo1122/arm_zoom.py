# 伏地挺身最低點：兩個模型的手臂（肩-肘-腕）畫在同一張，放大，看誰比較貼近真的手肘
# MediaPipe：右側綠、左側藍；YOLO26n：右側紅、左側黃
import json, sys, math
from PIL import Image, ImageDraw
S = sys.argv[1]; out = sys.argv[2]
mp = json.load(open(S + '/vidout/mediapipe-lite.json')); yo = json.load(open(S + '/vidout/yolo26n-pose-320-roi.json'))
W, H = mp['size']
MP = {'R': [12, 14, 16], 'L': [11, 13, 15]}
YO = {'R': [6, 8, 10], 'L': [5, 7, 9]}
def ang(p):
    a, b, c = p
    v1 = (a[0]-b[0], a[1]-b[1]); v2 = (c[0]-b[0], c[1]-b[1])
    return math.degrees(math.acos(max(-1, min(1, (v1[0]*v2[0]+v1[1]*v2[1]) / math.hypot(*v1) / math.hypot(*v2)))))
n = min(len(mp['frames']), len(yo['frames']), 63)
# 找 MediaPipe 右手肘最小的那一格（最低點）
best = None
for i in range(n):
    m = mp['frames'][i]['r']
    if not m: continue
    a = ang([(m[k][0]*W, m[k][1]*H) for k in MP['R']])
    if best is None or a < best[1]: best = (i, a)
tiles = []
for fi in [best[0]]:
    im = Image.open(f'{S}/frames/pu_{fi:03d}.png').convert('RGB'); d = ImageDraw.Draw(im)
    m = mp['frames'][fi]['r']; y = yo['frames'][fi]['r']['k']
    txt = []
    for side, col in (('R', (0, 200, 0)), ('L', (60, 120, 255))):
        p = [(m[i][0] * W, m[i][1] * H) for i in MP[side]]
        d.line(p, fill=col, width=2); txt.append(f'MP {side} {ang(p):.0f}')
        for q in p: d.ellipse([q[0]-2, q[1]-2, q[0]+2, q[1]+2], fill=col)
    for side, col in (('R', (255, 40, 40)), ('L', (255, 200, 0))):
        p = [(y[i][0] * W, y[i][1] * H) for i in YO[side]]
        d.line(p, fill=col, width=2); txt.append(f'YO {side} {ang(p):.0f}')
        for q in p: d.ellipse([q[0]-2, q[1]-2, q[0]+2, q[1]+2], fill=col)
    print('frame', fi, ' '.join(txt))
    xs = [m[i][0]*W for i in MP['R']+MP['L']] + [y[i][0]*W for i in YO['R']+YO['L']]
    ys = [m[i][1]*H for i in MP['R']+MP['L']] + [y[i][1]*H for i in YO['R']+YO['L']]
    box = (int(min(xs))-30, int(min(ys))-30, int(max(xs))+30, int(max(ys))+30)
    crop = im.crop(box); crop = crop.resize((crop.width*4, crop.height*4), Image.LANCZOS)
    tiles.append(crop)
tiles[0].save(out); print(out, tiles[0].size)
