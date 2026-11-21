# 第 6 階段檢查（暫存區）：tools/yolo-train.py 的 transfer：同一張輸入，21 點模型的前 17 點和官方一樣、新的 4 點等於腳踝
import sys, importlib.util
import torch
from ultralytics import YOLO
spec = importlib.util.spec_from_file_location('yt', sys.argv[1]); yt = importlib.util.module_from_spec(spec); spec.loader.exec_module(yt)
base = YOLO(sys.argv[2])
new = yt.transfer(base, [21, 3], 1)
base.model.eval(); new.eval()
torch.manual_seed(0)
x = torch.rand(1, 3, 320, 320)
with torch.no_grad():
    a = base.model(x)[0]   # [1, 300, 57]
    b = new(x)[0]          # [1, 300, 69]
print('shapes', tuple(a.shape), tuple(b.shape))
# 沒轉檔的輸出：[1, 4 框 + 1 分數 + 點 × 3, 2100 個位置]
print('前 56 列（框、分數、17 點）最大差', float((a - b[:, :56]).abs().max()))
for j, k in yt.START_FROM.items():
    d = float((b[:, 5 + 3 * j:8 + 3 * j] - b[:, 5 + 3 * k:8 + 3 * k]).abs().max())
    print(f'點 {j} 和點 {k} 最大差', d)
