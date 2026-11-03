#!/usr/bin/env python3
import io, os, re
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'previews_src')
OUT = os.path.join(HERE, 'plugin_p2', 'previews')
panel = io.open(os.path.join(HERE, 'plugin_p2', 'ui', 'panel.html'), encoding='utf-8').read()
block = panel[panel.index('  var SGAL = ['):panel.index('  var sgalMem = null;')]
slugs = re.findall(r"\['[^']+', '([a-z0-9-]+)'", block)
cols = int(re.search(r'var SGAL_COLS = (\d+);', panel).group(1))
cell = int(re.search(r'var SGAL_CELL = (\d+);', panel).group(1))
rows = -(-len(slugs) // cols)
sheet = Image.new('RGB', (cols * cell, rows * cell), (29, 31, 36))
for i, slug in enumerate(slugs):
    im = Image.open(os.path.join(SRC, slug + '.jpg')).convert('RGB')
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = 0 if h > w else (h - side) // 2
    sq = im.crop((left, top, left + side, top + side)).resize((cell, cell), Image.LANCZOS)
    sheet.paste(sq, ((i % cols) * cell, (i // cols) * cell))
os.makedirs(OUT, exist_ok=True)
for n in os.listdir(OUT):
    os.remove(os.path.join(OUT, n))
dst = os.path.join(OUT, 'styles.jpg')
sheet.save(dst, 'JPEG', quality=82, optimize=True, progressive=False)
print(dst, sheet.size, os.path.getsize(dst), 'styles:', len(slugs))
