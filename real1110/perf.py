# 真手機的效能（只讀 meta 和每一格的時間，不印座標）：python3 -I perf.py <資料夾>
#   每秒格數、畫面間隔的中位數／95%／最大、超過 100 毫秒的卡頓幾次、AI 每格幾毫秒、運算方式、鏡頭每秒格數、選的設定
import sys, os, json, re
d = sys.argv[1]
def pct(a, p):
    a = sorted(a); return a[min(len(a) - 1, int(len(a) * p))]
rows = []
for name in sorted(os.listdir(d)):
    if not name.endswith('.json'): continue
    data = json.load(open(os.path.join(d, name), encoding='utf-8'))
    m = data.get('meta', {}); frames = data.get('frames', [])
    ts = [f.get('t') if isinstance(f, dict) else f[0] for f in frames]
    ts = [t for t in ts if isinstance(t, (int, float))]
    gaps = [b - a for a, b in zip(ts, ts[1:])]
    dur = (ts[-1] - ts[0]) / 1000
    ua = m.get('userAgent', '')
    dev = 'iPhone' if 'iPhone' in ua else 'Android' if 'Android' in ua else 'Windows' if 'Windows' in ua else 'Mac' if 'Mac' in ua else '?'
    br = 'Chrome' if 'Chrome/' in ua and 'Edg/' not in ua else 'Edge' if 'Edg/' in ua else 'Safari' if 'Safari/' in ua else '?'
    ver = re.search(r'(?:Chrome|Version|Edg)/(\d+)', ua)
    rows.append(dict(name=name[5:20], fps=len(ts) / dur, p50=pct(gaps, .5), p95=pct(gaps, .95), mx=max(gaps), stalls=sum(1 for g in gaps if g > 100), big=sum(1 for g in gaps if g > 250),
                     ai=m.get('aiMsPerFrame'), mode=m.get('computeMode'), cam=m.get('cameraFrameRate'), fpsChoice=m.get('fpsChoice'), modelChoice=m.get('modelChoice'), model=m.get('model'),
                     dev=dev + ' ' + br + (' ' + ver.group(1) if ver else ''), app=m.get('app'), size=str(m.get('videoWidth')) + 'x' + str(m.get('videoHeight')), mirrored=m.get('displayMirrored'), dur=dur))
print('檔案 | 每秒格數 | 間隔 中位數/95%/最大（毫秒）| >100ms 幾次 | >250ms 幾次 | AI 每格 | 運算 | 鏡頭格數 | 流暢度選 | 模型選')
for r in rows:
    print(f"{r['name']} | {r['fps']:.1f} | {r['p50']:.0f}/{r['p95']:.0f}/{r['mx']:.0f} | {r['stalls']} | {r['big']} | {r['ai']} | {r['mode']} | {r['cam']} | {r['fpsChoice']} | {r['modelChoice']}")
print('裝置：', sorted(set(r['dev'] for r in rows)), '；畫面：', sorted(set(r['size'] for r in rows)), '；app：', sorted(set(str(r['app']) for r in rows)), '；鏡像：', sorted(set(str(r['mirrored']) for r in rows)))
tot = sum(r['dur'] for r in rows)
print('合計 %.0f 秒；平均每秒 %.1f 格；>100ms 的卡頓共 %d 次（每分鐘 %.1f 次）；>250ms 共 %d 次' % (tot, sum(r['fps'] * r['dur'] for r in rows) / tot, sum(r['stalls'] for r in rows), sum(r['stalls'] for r in rows) / tot * 60, sum(r['big'] for r in rows)))
