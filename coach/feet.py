# 蹲到最低時的腳：放大畫小腿和腳（膝、踝、腳跟、腳尖），印出腳跟比腳尖高多少（以小腿長為 100%）
import json, sys, math
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1])); W, H = d['meta']['videoWidth'], d['meta']['videoHeight']
fr = d['frames']; times = [float(x) for x in sys.argv[3].split(',')]
img = Image.new('RGB', (300 * len(times), 330), 'white'); dr = ImageDraw.Draw(img)
for k, t in enumerate(times):
    j = min(range(len(fr)), key=lambda i: abs(fr[i]['t'] / 1000 - t)); lm = fr[j]['landmarks']
    P = lambda i: (lm[i][0] * W, lm[i][1] * H)
    out = []
    for side, (kn, an, he, to) in {'L': (25, 27, 29, 31), 'R': (26, 28, 30, 32)}.items():
        shank = math.dist(P(kn), P(an))
        out.append(f"{side} 腳跟高 {(P(to)[1] - P(he)[1]) / shank * 100:.0f}% vis 膝{lm[kn][3]:.2f} 踝{lm[an][3]:.2f} 跟{lm[he][3]:.2f} 尖{lm[to][3]:.2f}")
    print(f'{t:.1f}s', ' | '.join(out))
    # 以左右腳踝中間為中心，放大 2.5 倍
    cx = (P(27)[0] + P(28)[0]) / 2; cy = (P(27)[1] + P(28)[1]) / 2
    S = lambda i: (150 + 300 * k + (P(i)[0] - cx) * 2.5, 230 + (P(i)[1] - cy) * 2.5)
    for a, b, col in [(23, 25, 'blue'), (25, 27, 'blue'), (27, 29, 'blue'), (29, 31, 'blue'), (27, 31, 'blue'), (24, 26, 'red'), (26, 28, 'red'), (28, 30, 'red'), (30, 32, 'red'), (28, 32, 'red')]:
        dr.line([S(a), S(b)], fill=col, width=3)
    for i, nm in [(29, 'heel'), (31, 'toe')]: dr.text(S(i), nm, fill='black')
    dr.text((300 * k + 5, 5), f'{t:.1f}s', fill='black'); dr.line([(300 * k, 0), (300 * k, 330)], fill='gray')
img.save(sys.argv[2])
