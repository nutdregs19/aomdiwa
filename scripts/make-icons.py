# App icons -> public/icons/. Run once: python scripts/make-icons.py  (never overwrites)
# A brass disc with a dark "dip then rise" stroke: buy on the dip.
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
BG, BRASS, INK = (12, 16, 13, 255), (226, 173, 69, 255), (17, 21, 15, 255)


def icon(size, pad):
    s = size * 4  # draw big, shrink for smooth edges
    im = Image.new('RGBA', (s, s), BG)
    d = ImageDraw.Draw(im)
    r = s * (0.5 - pad)
    c = s / 2
    d.ellipse([c - r, c - r, c + r, c + r], fill=BRASS)
    pts = [(-0.52, -0.18), (-0.14, 0.30), (0.10, 0.02), (0.52, -0.40)]
    pts = [(c + x * r, c + y * r) for x, y in pts]
    w = int(r * 0.17)
    d.line(pts, fill=INK, width=w, joint='curve')
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=INK)
    return im.resize((size, size), Image.LANCZOS)


for name, size, pad in [('icon-192.png', 192, 0.14), ('icon-512.png', 512, 0.14), ('maskable-512.png', 512, 0.24), ('apple-touch-icon.png', 180, 0.14)]:
    p = os.path.join(OUT, name)
    if os.path.exists(p):
        print('มีอยู่แล้ว ข้าม', name)
        continue
    icon(size, pad).save(p + '.tmp', 'PNG')
    os.replace(p + '.tmp', p)
    print('เขียน', name)
