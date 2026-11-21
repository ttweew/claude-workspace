# 自己訓練 YOLO 的資料（11/21，讓使用者自己選模型的第 6 步）：影片＋同一段影片用 MediaPipe 算的錄製檔 → YOLO 姿勢模型的訓練資料
# 為什麼：官方的 YOLO 只有 17 個點，沒有腳跟、腳尖（深蹲的「腳跟離地」、弓箭步的「前膝超過腳尖」要用）；
# MediaPipe 有這 4 個點，用它幫影片的每一格「標答案」（自動標記），就能訓練一個有 21 個點的 YOLO
# 注意：答案是 MediaPipe 算的，它錯的地方 YOLO 也會學到；重要的影片要人工看過（Ultralytics 的標記工具或 CVAT 都能改）
#
# 錄製檔要用「模型對照」頁（compare.html）下載的：每一格的時間就是影片裡的時間（首頁鏡頭錄的不是）。模型選 MediaPipe full（比較準）
# 用法（在專案資料夾；要 opencv-python，和 tools/export-yolo.py 同一個 venv）：
#   venv/bin/python tools/yolo-dataset.py 影片.mp4 錄製檔.json --out datasets/feet [--every 2] [--val 0.2]
#   好幾段影片：每段跑一次、--out 用同一個資料夾（檔名前面會加影片的名字，不會蓋掉）
# 輸出：datasets/feet/images/{train,val}/*.jpg（每一格整個畫面一張、框出人的那一塊一張 *_roi.jpg）、labels/{train,val}/*.txt、data.yaml（tools/yolo-train.py 用）
# 影片、圖片是組員的真人錄影：只放在自己的電腦，不放進 repo（.gitignore 已經排除 datasets/）
import argparse
import json
import sys
from pathlib import Path

import cv2

# MediaPipe 33 點裡要用的 21 點（順序就是訓練資料的順序）：COCO 的 17 點，再加左右腳跟、左右腳尖
MP_INDEX = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
NAMES = ['NOSE', 'LEFT_EYE', 'RIGHT_EYE', 'LEFT_EAR', 'RIGHT_EAR', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ELBOW', 'RIGHT_ELBOW',
         'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE',
         'LEFT_HEEL', 'RIGHT_HEEL', 'LEFT_FOOT_INDEX', 'RIGHT_FOOT_INDEX']
# 左右翻轉時對應的點（訓練時會把圖左右翻過來增加資料，左邊的點要變成右邊的點）
FLIP_IDX = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19]
SEEN = 0.65      # MediaPipe 的 visibility 在這以上算看得到（和網站的 MIN_VISIBILITY 一樣）
GUESS = 0.3      # 0.3～0.65：MediaPipe 猜的（被擋住）→ 標成「有、但被擋住」；再低的不標
MIN_POINTS = 8   # 看得到的點少於這個的格子不用（人只拍到一半、MediaPipe 找錯）
# 每個點的容許範圍（OKS sigma：Ultralytics 算準確度、訓練時扣分用；越大越寬鬆）：前 17 點是 COCO 官方的值（ultralytics 的 OKS_SIGMA），
# 腳跟、腳尖用腳踝的 0.089（COCO-WholeBody 的腳是 0.066～0.094）。不寫的話 21 點會變成每個點都是 1/21，
# 髖、膝這些點比官方嚴很多：準確度算起來偏低、訓練時的扣分也和官方不一樣
OKS_SIGMAS = [0.026, 0.025, 0.025, 0.035, 0.035, 0.079, 0.079, 0.072, 0.072, 0.062, 0.062, 0.107, 0.107, 0.087, 0.087, 0.089, 0.089,
              0.089, 0.089, 0.089, 0.089]
# 網站「先框出人」（js/ai/yolo-core.js 的 regionFor）：上一格的框放大 25%、取正方形，只把那一塊給模型看，人變成大約 2 倍大。
# 所以每一格除了整個畫面，也存一張「框出人」的那一塊，訓練時兩種大小都看過。11/21 試過：只用整個畫面訓練，
# 放進網站後只有 70% 的格子找到人、腳跟腳尖和 MediaPipe 差 23～25 像素；網站不框出人時 100%、差 3～4 像素
ROI_GROW = 1.25


def roi_of(box, W, H):
    """人的框（像素 x1, y1, x2, y2）→ 網站框出人的那一塊 (rx, ry, rw, rh)；和 regionFor 一樣：太小、幾乎整個畫面就不用（None）"""
    x1, y1, x2, y2 = box
    side = max(x2 - x1, y2 - y1) * ROI_GROW
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    rx, ry = max(0.0, cx - side / 2), max(0.0, cy - side / 2)
    rw, rh = min(W, cx + side / 2) - rx, min(H, cy + side / 2) - ry
    if rw < 16 or rh < 16 or rw * rh > 0.9 * W * H:
        return None
    return int(rx), int(ry), int(round(rw)), int(round(rh))


def label_line(points, region=None):
    """一格的 21 點 → YOLO 的一行標記；region=(rx, ry, rw, rh, W, H) 時換成那一塊裡的位置（跑到外面的點標成沒有）；點太少回傳 None"""
    kpts, xs, ys, seen = [], [], [], 0
    for i in MP_INDEX:
        x, y, vis = points[i][0], points[i][1], points[i][3]
        if region:
            rx, ry, rw, rh, W, H = region
            x, y = (x * W - rx) / rw, (y * H - ry) / rh
        inside = 0 <= x <= 1 and 0 <= y <= 1
        v = 2 if vis >= SEEN and inside else 1 if vis >= GUESS and inside else 0
        if v == 2:
            seen += 1
        if v:
            xs.append(x)
            ys.append(y)
        kpts += [x if v else 0, y if v else 0, v]
    if seen < MIN_POINTS:
        return None
    # 人的框：點的範圍放大一點（點在關節中心，身體比點寬；頭頂在鼻子上面，上面多留一些）
    x1, x2, y1, y2 = min(xs), max(xs), min(ys), max(ys)
    w, h = x2 - x1, y2 - y1
    x1, x2 = max(0.0, x1 - 0.1 * w), min(1.0, x2 + 0.1 * w)
    y1, y2 = max(0.0, y1 - 0.15 * h), min(1.0, y2 + 0.05 * h)
    box = [(x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1]
    return ' '.join(['0'] + [f'{v:.6f}' for v in box] + [f'{v:.6f}' if i % 3 != 2 else str(v) for i, v in enumerate(kpts)])


def read_recording(path):
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if data.get('format') != 'ai-sport-pose':
        sys.exit('這不是網站的錄製檔（JSON）')
    meta = data.get('meta') or {}
    if meta.get('source') != 'compare':
        print('注意：這個錄製檔不是「模型對照」頁算的，每一格的時間可能和影片對不上（首頁鏡頭錄的是從按下錄影開始算）')
    if not str(meta.get('model', '')).startswith('pose_landmarker'):
        print('注意：這個錄製檔不是 MediaPipe 算的（' + str(meta.get('model')) + '），沒有腳跟、腳尖的點')
    frames = []
    for f in data.get('frames') or []:
        lm = f.get('landmarks')
        if isinstance(lm, list) and len(lm) == 33 and isinstance(f.get('t'), (int, float)):
            frames.append((float(f['t']), lm))
    return frames


def main():
    ap = argparse.ArgumentParser(description='影片＋MediaPipe 的錄製檔 → YOLO 姿勢模型的訓練資料（21 點）')
    ap.add_argument('video')
    ap.add_argument('recording')
    ap.add_argument('--out', default='datasets/feet')
    ap.add_argument('--every', type=int, default=2, help='每幾格取一格（相鄰的格子幾乎一樣，全部用只會多花時間）')
    ap.add_argument('--val', type=float, default=0.2, help='最後多少比例當驗證資料（用影片最後一段，不和訓練的格子混在一起）')
    args = ap.parse_args()
    out = Path(args.out)
    frames = read_recording(args.recording)[::max(1, args.every)]
    if not frames:
        sys.exit('錄製檔裡沒有找到人的格子')
    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        sys.exit('打不開影片：' + args.video)
    stem = Path(args.video).stem
    cut = int(len(frames) * (1 - args.val))
    counts = {'train': 0, 'val': 0, 'skip': 0}
    for k, (t, lm) in enumerate(frames):
        line = label_line(lm)
        if line is None:
            counts['skip'] += 1
            continue
        cap.set(cv2.CAP_PROP_POS_MSEC, t)
        ok, img = cap.read()
        if not ok:
            counts['skip'] += 1
            continue
        part = 'train' if k < cut else 'val'
        name = f'{stem}_{int(round(t)):08d}'
        (out / 'images' / part).mkdir(parents=True, exist_ok=True)
        (out / 'labels' / part).mkdir(parents=True, exist_ok=True)
        shots = [(name, img, line)]
        # 框出人的那一塊（網站上大部分的格子是這樣看的）
        H, W = img.shape[:2]
        cx, cy, bw, bh = map(float, line.split()[1:5])
        roi = roi_of(((cx - bw / 2) * W, (cy - bh / 2) * H, (cx + bw / 2) * W, (cy + bh / 2) * H), W, H)
        roi_line = label_line(lm, roi + (W, H)) if roi else None
        if roi_line:
            rx, ry, rw, rh = roi
            shots.append((name + '_roi', img[ry:ry + rh, rx:rx + rw], roi_line))
        for shot, picture, text in shots:
            cv2.imwrite(str(out / 'images' / part / (shot + '.jpg')), picture, [cv2.IMWRITE_JPEG_QUALITY, 92])
            (out / 'labels' / part / (shot + '.txt')).write_text(text + '\n', encoding='utf-8')
            counts[part] += 1
    cap.release()
    (out / 'data.yaml').write_text('\n'.join([
        '# tools/yolo-dataset.py 產生：21 個點（COCO 的 17 點＋左右腳跟、左右腳尖），答案是 MediaPipe 自動標的',
        f'path: {out.resolve()}',
        'train: images/train',
        'val: images/val',
        'kpt_shape: [21, 3]',
        'flip_idx: [' + ', '.join(map(str, FLIP_IDX)) + ']',
        'kpt_oks_sigmas: [' + ', '.join(map(str, OKS_SIGMAS)) + ']',
        'names:',
        '  0: person',
        'kpt_names:',
        '  0: [' + ', '.join(NAMES) + ']',
        ''
    ]), encoding='utf-8')
    print(f"{stem}：訓練 {counts['train']} 張、驗證 {counts['val']} 張、跳過 {counts['skip']} 格 → {out}")


if __name__ == '__main__':
    main()
