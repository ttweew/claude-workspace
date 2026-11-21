# 第 6 階段實測（暫存區）：訓練資料的一張圖＋標記畫在一起，看點有沒有在人身上（影片和錄製檔的時間對不對得上）
# 用法：python draw_label.py <datasets/feet> <輸出.png> [第幾張]
import sys
from pathlib import Path
import cv2
root, out = Path(sys.argv[1]), sys.argv[2]
names = sorted((root / 'images' / 'train').glob(sys.argv[4] if len(sys.argv) > 4 else '*.jpg'))
k = int(sys.argv[3]) if len(sys.argv) > 3 else 0
tiles = []
for img_path in names[k:k + 4]:
    img = cv2.imread(str(img_path))
    h, w = img.shape[:2]
    v = (root / 'labels' / 'train' / (img_path.stem + '.txt')).read_text().split()
    cx, cy, bw, bh = map(float, v[1:5])
    cv2.rectangle(img, (int((cx - bw / 2) * w), int((cy - bh / 2) * h)), (int((cx + bw / 2) * w), int((cy + bh / 2) * h)), (0, 255, 255), 1)
    pts = v[5:]
    for j in range(21):
        x, y, vis = float(pts[3 * j]), float(pts[3 * j + 1]), int(pts[3 * j + 2])
        if vis == 0:
            continue
        color = (0, 0, 255) if j >= 17 else (0, 255, 0)   # 腳跟、腳尖紅色
        cv2.circle(img, (int(x * w), int(y * h)), 4 if vis == 2 else 2, color, -1)
    cv2.putText(img, img_path.stem[-8:], (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    tiles.append(cv2.resize(img, (480, 360)) if img.shape[:2] != (360, 640) else cv2.resize(img, (480, 270)))
cv2.imwrite(out, cv2.vconcat([cv2.hconcat(tiles[:2]), cv2.hconcat(tiles[2:4])]))
print('ok', out)
