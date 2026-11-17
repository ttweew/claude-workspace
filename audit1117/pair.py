# 用法：python3 pair.py <before 資料夾> <after 資料夾> <輸出資料夾>：每張截圖左右並排（左：改之前，右：改之後）
import sys, os
from PIL import Image, ImageDraw, ImageFont
a, b, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 28)
except Exception:
    font = ImageFont.load_default()
for name in sorted(os.listdir(b)):
    if not name.endswith('.png') or not os.path.exists(os.path.join(a, name)):
        continue
    A, B = Image.open(os.path.join(a, name)), Image.open(os.path.join(b, name))
    h = max(A.height, B.height); gap = 24; top = 50
    img = Image.new('RGB', (A.width + B.width + gap, h + top), (240, 240, 240))
    img.paste(A, (0, top)); img.paste(B, (A.width + gap, top))
    d = ImageDraw.Draw(img)
    d.text((10, 8), '改之前', fill=(20, 20, 20), font=font)
    d.text((A.width + gap + 10, 8), '改之後', fill=(20, 20, 20), font=font)
    img.save(os.path.join(out, name))
print('ok')
