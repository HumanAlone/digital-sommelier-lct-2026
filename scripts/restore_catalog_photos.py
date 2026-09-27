"""Restore exact CSV photo_path matches from the supplied multipart archive."""
import csv
import json
import subprocess
import sys
from pathlib import Path, PureWindowsPath
from PIL import Image
import io
import hashlib

ROOT = Path(__file__).resolve().parents[1]
OVERRIDES = {
    'zb-vajn-spumante-bryut-beloe': 'Spumante_belyj_bryut_d34e854a7b.webp',
    'zb-vajn-moskato-polusladkoe-beloe': 'ZB_VAJN_Moskato_beloe_polusladkoe_68f4d64b83.webp',
    'zb-vajn-moskato-polusladkoe-rozovoe': 'zolotaya_balka_zb_moscato_semi_sweet_rose_muskat_yantarnyy_rozovoe_polusladkoe_9_25026eb2e3.webp',
    'zb-vajn-risling-polusuhoe-beloe': 'zolotaya_balka_zb_wine_riesling_risling_beloe_polusuhoe_115_1b10f56379.webp',
    'zb-vajn-spumante-bryut-rozovoe': 'Spumante_rozovyj_bryut_3e35043a8d.webp',
    'zb-vajn-spumante-polusuhoe-beloe': 'Spumante_beloe_polusuhoe_761f7504ed.webp',
    'igristoe-zhemchuzhnoe-vino-polusuhoe-krasnoe-di-kaspiko-fiori-di-mare-di-caspico-fiori-di-mare': 'derbent_vino_di_kaspiko_fiori_di_mare_moldova_krasnoe_polusuhoe_95_115_b596641f9f.webp',
    'polusladkoe-krasnoe-zb-vajn-frizzante': 'Frizante_krasnoe_polusladkoe_67706f9516.webp',
    'polusladkoe-krasnoe-zolotaya-balka': 'Polusladkoe_krasnoe_09d1ac765c.webp',
    'polusladkoe-rozovoe-zolotaya-balka': 'Polusladkoe_rozovoe_1_48c22903f2.webp',
    'suhoe-beloe-zb-vajn-frizzante': 'zolotaya_balka_zb_frizzante_dry_risling_beloe_suhoe_10_992e8ffb9f.webp',
}


def main(archive):
    frontend = ROOT / 'frontend'
    assets = frontend / 'assets/wines'
    tool = r'C:\Program Files\WinRAR\UnRAR.exe'
    rows = list(csv.DictReader((ROOT / 'backend/data/catalog_cleaned.csv').open(encoding='utf-8-sig')))
    catalog = json.loads((frontend / 'catalog.json').read_text(encoding='utf-8'))
    mapping_file = frontend / 'local-image-map.js'
    mapping = json.loads(mapping_file.read_text(encoding='utf-8').split(' = ', 1)[1].strip().removesuffix(';'))
    paths = []
    for volume in sorted(archive.parent.glob('prod-svoe-vino-strapi.part*.rar')):
        listing = subprocess.run([tool, 'lb', '-p-', str(volume)], capture_output=True, check=True)
        paths.extend(listing.stdout.decode('utf-8', errors='replace').splitlines())
    by_name = {PureWindowsPath(path).name: path for path in paths}
    selected = {}
    for row in rows:
        if row['Slug'] in mapping and (frontend / mapping[row['Slug']]).is_file():
            continue
        name = OVERRIDES.get(row['Slug'], PureWindowsPath(row['photo_path']).name)
        if name in by_name:
            selected[row['Slug']] = name
    needed = sorted({by_name[name] for name in selected.values() if not (assets / name).is_file()})
    selection_file = ROOT / 'scripts/photo-extraction-list.txt'
    if needed:
        selection_file.write_text('\n'.join(needed), encoding='utf-16')
        result = subprocess.run([tool, 'e', '-p-', '-o-', '-inul', '-scul', str(archive), '@' + str(selection_file), str(assets) + '\\'], capture_output=True)
        print('Extraction exit:', result.returncode, flush=True)
        selection_file.unlink()
    for slug, name in selected.items():
        path = assets / name
        if not path.is_file():
            # Long source names exceed Windows path limits when extracted.
            result = subprocess.run([tool, 'p', '-p-', '-inul', str(archive), by_name[name]], capture_output=True)
            if result.returncode:
                continue
            try:
                with Image.open(io.BytesIO(result.stdout)) as img:
                    img.load()
            except Exception:
                continue
            name = 'matched_' + hashlib.sha256(name.encode()).hexdigest()[:20] + '.webp'
            path = assets / name
            path.write_bytes(result.stdout)
        try:
            with Image.open(path) as img:
                img.verify()
        except Exception:
            continue
        mapping[slug] = './assets/wines/' + name
    invalid = []
    for slug, url in list(mapping.items()):
        try:
            with Image.open(frontend / url) as img:
                img.verify()
        except Exception:
            invalid.append(slug)
            del mapping[slug]
    for wine in catalog:
        if wine['id'] in mapping:
            wine['image_url'] = mapping[wine['id']]
    unresolved = [{'id': w['id'], 'name': w['name']} for w in catalog if w['id'] not in mapping]
    (frontend / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    mapping_file.write_text('window.WINE_LOCAL_IMAGE_MAP = ' + json.dumps(mapping, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    report = {'total': len(catalog), 'local_photos': len(mapping), 'invalid_images': invalid, 'unresolved': unresolved}
    (ROOT / 'docs/photo-import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'total': len(catalog), 'local_photos': len(mapping), 'unresolved': len(unresolved), 'invalid': len(invalid)}), flush=True)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
