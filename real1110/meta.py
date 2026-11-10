# 每個錄製檔的基本資訊（只讀 meta 和格數，不印座標）：python3 -I meta.py <資料夾>
import sys, os, json
d = sys.argv[1]
for name in sorted(os.listdir(d)):
    if not name.endswith('.json'):
        continue
    with open(os.path.join(d, name), encoding='utf-8') as f:
        data = json.load(f)
    meta = data.get('meta', {}) if isinstance(data, dict) else {}
    frames = data.get('frames', []) if isinstance(data, dict) else []
    keys = sorted(meta.keys()) if isinstance(meta, dict) else type(meta).__name__
    t0 = frames[0].get('t') if frames and isinstance(frames[0], dict) else None
    t1 = frames[-1].get('t') if frames and isinstance(frames[-1], dict) else None
    dur = (t1 - t0) / 1000 if isinstance(t0, (int, float)) and isinstance(t1, (int, float)) else None
    short = {k: meta.get(k) for k in ('workout', 'test', 'calibration', 'fps', 'model', 'width', 'height', 'facing', 'version', 'source') if isinstance(meta, dict) and k in meta}
    print(name, '格數', len(frames), '秒數', None if dur is None else round(dur, 1), json.dumps(short, ensure_ascii=False)[:300])
    if name == sorted(os.listdir(d))[0]:
        print('  meta 的欄位：', keys, '；頂層欄位：', sorted(data.keys()) if isinstance(data, dict) else type(data).__name__)
