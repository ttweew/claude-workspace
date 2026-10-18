from PIL import Image, ImageDraw, ImageFont
import sys, glob
def sheet(files, names, out, h=420, cols=5):
    ims = []
    for f in files:
        im = Image.open(f).convert('RGB'); s = h / im.height; ims.append(im.resize((max(1, int(im.width * s)), h)))
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    W = max(sum(i.width for i in r) + 10 * (len(r) + 1) for r in rows); H = len(rows) * (h + 40) + 10
    canvas = Image.new('RGB', (W, H), '#dddddd'); d = ImageDraw.Draw(canvas)
    try: font = ImageFont.truetype('/usr/share/fonts/opentype/unifont/unifont.otf', 22)
    except Exception: font = ImageFont.load_default()
    k = 0
    for ri, r in enumerate(rows):
        x = 10
        for im in r:
            y = 10 + ri * (h + 40); d.text((x, y), names[k], fill='black', font=font); canvas.paste(im, (x, y + 30)); x += im.width + 10; k += 1
    canvas.save(out)
tag, kind = sys.argv[1], sys.argv[2]
names = ["iPhone SE", "iPhone 13", "iPhone13橫", "14 Pro Max", "Pixel 7", "Galaxy S9+", "Pixel7橫", "iPad Mini", "iPadPro橫", "筆電1366", "筆電1280", "桌機1920", "2K"]
files = sorted(glob.glob(f"audit/{tag}_*_{kind}.png"))
sheet([files[i] for i in [0,1,3,4,5,7]], [names[i] for i in [0,1,3,4,5,7]], f"audit/sheet_{tag}_{kind}_portrait.png", cols=6)
sheet([files[i] for i in [2,6,8,9,10,11,12]], [names[i] for i in [2,6,8,9,10,11,12]], f"audit/sheet_{tag}_{kind}_landscape.png", h=300, cols=4)
