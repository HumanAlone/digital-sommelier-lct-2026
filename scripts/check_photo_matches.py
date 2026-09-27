"""Create a numbered contact sheet for reviewing explicit archive matches."""
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
from restore_catalog_photos import OVERRIDES, ROOT

catalog = {w['id']: w for w in json.loads((ROOT / 'frontend/catalog.json').read_text(encoding='utf-8'))}
sheet = Image.new('RGB', (1100, 1050), 'white')
draw = ImageDraw.Draw(sheet)
for i, slug in enumerate(OVERRIDES):
    wine = catalog[slug]
    with Image.open(ROOT / 'frontend' / wine['image_url']) as image:
        thumb = ImageOps.contain(image.convert('RGB'), (260, 300))
        x, y = (i % 4) * 275, (i // 4) * 350
        sheet.paste(thumb, (x + (275-thumb.width)//2, y + 25))
        draw.text((x+5, y+5), f'{i+1}: {slug[:36]}', fill='black')
sheet.save(ROOT / 'docs/photo-review.jpg')
