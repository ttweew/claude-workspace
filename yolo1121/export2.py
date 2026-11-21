# 11/21：YOLO26n-pose 再轉三種給網頁比：LiteRT（fp32、w8a32 動態 int8）和 ONNX fp16；輸入 320
import shutil, sys
from pathlib import Path
from ultralytics import YOLO
here = Path(__file__).parent
src = here / 'weights' / 'yolo26n-pose.pt'
jobs = [
    ('litert', None, 'yolo26n-pose-320.tflite'),
    ('litert', 'w8a32', 'yolo26n-pose-w8a32-320.tflite'),
    ('onnx', 16, 'yolo26n-pose-fp16-320.onnx'),
]
which = sys.argv[1:] or [j[2] for j in jobs]
for fmt, q, name in jobs:
    if name not in which: continue
    model = YOLO(str(src))
    kw = dict(format=fmt, imgsz=320, nms=False)
    if fmt == 'onnx': kw.update(simplify=True, dynamic=False)
    if q is not None: kw['quantize'] = q
    out = Path(model.export(**kw))
    dst = here / 'weights' / name
    if out.is_dir():
        cand = sorted(out.glob('*.tflite'))
        print('dir', out, [c.name for c in cand]); out = cand[0]
    shutil.move(str(out), dst)
    print('OK', name, round(dst.stat().st_size / 1e6, 2), 'MB')
