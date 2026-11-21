# 11/21：伏地挺身最低點 320 抓不準 → 試 640 的 LiteRT（fp32），和大一號的 YOLO26s-pose（320）
import shutil, sys
from pathlib import Path
from ultralytics import YOLO
here = Path(__file__).parent
for src, size, name in [('yolo26n-pose.pt', 640, 'yolo26n-pose-640.tflite'), ('yolo26s-pose.pt', 320, 'yolo26s-pose-320.tflite')]:
    p = here / 'weights' / src
    if not p.exists(): print('missing', p); continue
    out = Path(YOLO(str(p)).export(format='litert', imgsz=size, nms=False))
    if out.is_dir(): out = sorted(out.glob('*.tflite'))[0]
    dst = here / 'weights' / name; shutil.move(str(out), dst); print('OK', name, round(dst.stat().st_size / 1e6, 2), 'MB')
