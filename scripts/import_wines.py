"""Import matched wine photos and descriptions from the supplied Strapi export.

Usage: python scripts/import_wines.py "C:/path/to/Датасет"
Only unambiguous filename matches are imported. The source dataset is read only.
"""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path, PurePosixPath

try:
    from PIL import Image
except ImportError:
    Image = None


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
IMAGE_DIR = FRONTEND / "assets" / "wines"
VARIANT = re.compile(r"^(thumbnail|small|medium|large)_", re.I)
HASH = re.compile(r"_([0-9a-f]{10})$", re.I)


def key(filename: str) -> str:
    name = PurePosixPath(filename).stem.lower()
    name = VARIANT.sub("", name)
    name = HASH.sub("", name)
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", name)).strip("_")


def variant(filename: str) -> str:
    match = VARIANT.match(PurePosixPath(filename).name)
    return match.group(1).lower() if match else "original"


def list_archive(archive: Path) -> list[str]:
    result = subprocess.run(["tar", "-tf", str(archive)], capture_output=True)
    # The first two RAR volumes contain complete files but tar reports an
    # incomplete final block. Their listing is still usable for those files.
    return result.stdout.decode("utf-8", errors="replace").splitlines()


def extract(archives: list[Path], paths: list[str]) -> None:
    if not paths:
        return
    unrar = shutil.which("UnRAR") or Path("C:/Program Files/WinRAR/UnRAR.exe")
    if not Path(unrar).is_file():
        raise RuntimeError("Для распаковки многотомного архива нужен UnRAR.exe из WinRAR.")
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", delete=False) as selection:
        selection.write("\n".join(path.replace("/", "\\") for path in paths) + "\n")
        selection_path = Path(selection.name)
    try:
        result = subprocess.run(
            [str(unrar), "e", "-o+", "-inul", str(archives[0]), f"@{selection_path}", f"{IMAGE_DIR}\\"],
            capture_output=True,
        )
        if result.returncode and any(not (IMAGE_DIR / PurePosixPath(path).name).is_file() for path in paths):
            raise RuntimeError(result.stderr.decode(errors="replace")[:500])
    finally:
        selection_path.unlink(missing_ok=True)


def main(dataset_dir: Path) -> None:
    csv_path = dataset_dir / "strapi_output0709.csv"
    archives = [dataset_dir / f"prod-svoe-vino-strapi.part{part}.rar" for part in (1, 2, 3)]
    if not csv_path.is_file() or any(not archive.is_file() for archive in archives):
        raise SystemExit("Не найдены CSV и все три части архива в папке датасета.")

    with csv_path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))

    index: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for part, archive in enumerate(archives):
        for path in list_archive(archive):
            filename = PurePosixPath(path).name
            normalized = key(filename)
            if len(normalized) >= 5 and filename.lower().endswith((".webp", ".jpg", ".jpeg", ".png")):
                index[normalized].append((part, path))

    selected: dict[str, tuple[int, str]] = {}
    skipped = 0
    for row in rows:
        filename = row["Название фото"].strip()
        # Strapi drops Cyrillic from stored filenames. Without its upload
        # metadata, a Cyrillic source name cannot identify the correct image.
        if not filename.isascii() or len(key(filename)) < 5:
            skipped += 1
            continue
        candidates = index.get(key(filename), [])
        hashes = {HASH.search(PurePosixPath(path).stem).group(1) for _, path in candidates if HASH.search(PurePosixPath(path).stem)}
        if len(hashes) != 1:
            skipped += 1
            continue
        selected[filename] = sorted(candidates, key=lambda item: {"medium": 0, "original": 1, "small": 2, "large": 3, "thumbnail": 4}[variant(item[1])])[0]

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    paths = sorted({path for _, path in selected.values()})
    print(f"Извлекаю {len(paths)} изображений из трёх частей архива", flush=True)
    extract(archives, paths)

    catalog = []
    seen_slugs = set()
    for row in rows:
        slug = row["Slug"].strip()
        if slug in seen_slugs or row["Название фото"].strip() not in selected:
            continue
        part, path = selected[row["Название фото"].strip()]
        image_path = IMAGE_DIR / PurePosixPath(path).name
        if not image_path.is_file() or image_path.stat().st_size < 100:
            continue
        if Image is not None:
            try:
                with Image.open(image_path) as photo:
                    photo.verify()
            except Exception:
                continue
        seen_slugs.add(slug)
        catalog.append({
            "id": slug,
            "name": row["Название вина"].strip(),
            "category": row["Категория"].strip(),
            "color_description": row["Цвет"].strip(),
            "region": row["Регион"].strip(),
            "grapes": [grape.strip() for grape in row["Сорт винограда"].split(",") if grape.strip()],
            "description": row["Описание"].strip(),
            "winery": row["Винодельня"].strip(),
            "image_url": f"./assets/wines/{image_path.name}",
        })

    (FRONTEND / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Готово: {len(catalog)} вин, {len(selected)} сопоставленных фото. Неуверенные пары пропущены.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Использование: python scripts/import_wines.py <папка датасета>")
    main(Path(sys.argv[1]).resolve())
