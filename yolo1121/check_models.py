# 每個轉好的模型：輸入、輸出的形狀；同一張照片（pose.jpg）17 點和 fp32 ONNX 差幾像素
import sys, numpy as np
from pathlib import Path
from PIL import Image
here = Path(__file__).parent; W = here / 'weights'
img = Image.open(sys.argv[1]).convert('RGB'); w0, h0 = img.size
S = 320; sc = min(S / w0, S / h0); nw, nh = round(w0 * sc), round(h0 * sc); px, py = (S - nw) / 2, (S - nh) / 2
canvas = Image.new('RGB', (S, S), (114, 114, 114)); canvas.paste(img.resize((nw, nh), Image.BILINEAR), (int(round(px)), int(round(py))))
x = np.asarray(canvas, dtype=np.float32) / 255.0
def decode(out):
    out = out.reshape(-1, out.shape[-1]); best = out[:, 4].argmax(); r = out[best]
    k = r[6:].reshape(17, 3).copy()
    if k[:, :2].max() <= 1.5: k[:, :2] *= S          # 正規化座標（LiteRT 的輸出是 0～1）
    k[:, 0] = (k[:, 0] - px) / sc; k[:, 1] = (k[:, 1] - py) / sc
    return float(r[4]), k
res = {}
import onnxruntime as ort
for name in ['yolo26n-pose-320.onnx', 'yolo26n-pose-fp16-320.onnx', 'yolo26n-pose-int8-320.onnx']:
    s = ort.InferenceSession(str(W / name)); i = s.get_inputs()[0]; o = s.get_outputs()[0]
    inp = x.transpose(2, 0, 1)[None]
    if 'float16' in i.type: inp = inp.astype(np.float16)
    out = s.run(None, {i.name: inp})[0].astype(np.float32)
    res[name] = decode(out); print(name, i.name, i.shape, i.type, '->', o.shape, o.type)
from ai_edge_litert.interpreter import Interpreter
for name in ['yolo26n-pose-320.tflite', 'yolo26n-pose-w8a32-320.tflite']:
    it = Interpreter(model_path=str(W / name)); it.allocate_tensors()
    di = it.get_input_details()[0]; do = it.get_output_details()
    inp = x[None] if di['shape'][-1] == 3 else x.transpose(2, 0, 1)[None]
    it.set_tensor(di['index'], inp.astype(di['dtype'])); it.invoke()
    out = it.get_tensor(do[0]['index']).astype(np.float32)
    res[name] = decode(out); print(name, di['shape'].tolist(), di['dtype'].__name__, '->', [d['shape'].tolist() for d in do])
ref = res['yolo26n-pose-320.onnx'][1]
for name, (score, k) in res.items():
    d = np.hypot(*(k[:, :2] - ref[:, :2]).T)
    print(f'{name:32s} 人的分數 {score:.3f}  和 fp32 ONNX 差：平均 {d.mean():.2f} 像素、最多 {d.max():.2f}  點的可信度平均 {k[:, 2].mean():.3f}')
