# 上半身放大 2 倍：原圖（左）、MediaPipe 右側綠／左側藍（中）、YOLO 右側紅／左側黃（右）
import json, sys
from PIL import Image, ImageDraw
S = sys.argv[1]; frames = [int(x) for x in sys.argv[2].split(',')]; out = sys.argv[3]
mp = json.load(open(S + '/vidout/mediapipe-lite.json')); yo = json.load(open(S + '/vidout/yolo26n-pose-320.json'))
W, H = mp['size']; box = (330, 180, 500, 340); Z = 2
MP = {'R': [12, 14, 16, 24], 'L': [11, 13, 15, 23]}; YO = {'R': [6, 8, 10, 12], 'L': [5, 7, 9, 11]}
chain = [(0, 1), (1, 2), (0, 3)]
rows = []
for fi in frames:
    base = Image.open(f'{S}/frames/pu_{fi:03d}.png').convert('RGB')
    def panel(pts, cols):
        im = base.copy(); d = ImageDraw.Draw(im)
        for side, col in cols:
            p = [(q[0] * W, q[1] * H) for q in pts(side)]
            for a, b in chain: d.line([p[a], p[b]], fill=col, width=2)
            for q in p[:3]: d.ellipse([q[0] - 2.5, q[1] - 2.5, q[0] + 2.5, q[1] + 2.5], fill=col)
        return im.crop(box).resize(((box[2] - box[0]) * Z, (box[3] - box[1]) * Z))
    m = mp['frames'][fi]['r']; y = yo['frames'][fi]['r']['k']
    orig = base.crop(box).resize(((box[2] - box[0]) * Z, (box[3] - box[1]) * Z))
    a = panel(lambda s: [m[i] for i in MP[s]], [('L', (60, 120, 255)), ('R', (0, 200, 0))])
    b = panel(lambda s: [y[i] for i in YO[s]], [('L', (255, 200, 0)), ('R', (255, 40, 40))])
    row = Image.new('RGB', (orig.width * 3 + 8, orig.height), (255, 255, 255))
    for i, t in enumerate((orig, a, b)): row.paste(t, (i * (orig.width + 4), 0))
    rows.append(row)
canvas = Image.new('RGB', (rows[0].width, sum(r.height + 4 for r in rows)), (255, 255, 255))
yoff = 0
for r in rows: canvas.paste(r, (0, yoff)); yoff += r.height + 4
canvas.save(out); print(canvas.size)
