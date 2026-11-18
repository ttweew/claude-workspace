# YOLO26n-pose 轉成網頁用的 ONNX（640、320 兩種輸入大小），印出輸入、輸出的形狀
import shutil, sys, onnx
from pathlib import Path
from ultralytics import YOLO
here = Path(__file__).parent
src = here / 'weights' / 'yolo26n-pose.pt'
for size in (640, 320):
    model = YOLO(str(src))
    out = model.export(format='onnx', imgsz=size, simplify=True, dynamic=False, nms=False)
    dst = here / 'weights' / f'yolo26n-pose-{size}.onnx'
    shutil.move(out, dst)
    m = onnx.load(str(dst))
    shape = lambda v: [d.dim_value or d.dim_param for d in v.type.tensor_type.shape.dim]
    print(size, dst.name, round(dst.stat().st_size / 1e6, 2), 'MB', 'opset', m.opset_import[0].version,
          'in', [(i.name, shape(i)) for i in m.graph.input], 'out', [(o.name, shape(o)) for o in m.graph.output])
