# 第 6 階段除錯（暫存區）：訓練好的 21 點模型，用 Ultralytics 自己的 predict 看一張訓練圖：框、點和標記差多少
import sys
from pathlib import Path
from ultralytics import YOLO
root = Path(sys.argv[2])
img = sorted((root / 'images' / 'train').glob('*.jpg'))[20]
lab = (root / 'labels' / 'train' / (img.stem + '.txt')).read_text().split()
m = YOLO(sys.argv[1])
r = m.predict(str(img), imgsz=320, verbose=False)[0]
print('boxes', r.boxes.xyxyn.tolist()[:2], 'conf', r.boxes.conf.tolist()[:2])
k = r.keypoints.xyn[0].tolist()
c = r.keypoints.conf[0].tolist() if r.keypoints.conf is not None else None
for j in [0, 5, 6, 13, 14, 15, 16, 17, 18, 19, 20]:
    lx, ly, lv = float(lab[5 + 3 * j]), float(lab[6 + 3 * j]), lab[7 + 3 * j]
    print(j, 'pred', [round(v, 3) for v in k[j]], 'conf', round(c[j], 2) if c else None, 'label', [round(lx, 3), round(ly, 3)], lv)
