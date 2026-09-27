"""Synchronize frontend catalog image URLs with the backend catalog contract."""

from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
PHOTO_BASE = "https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/"


def local_image_map() -> dict[str, str]:
    """Recover verified local paths from the catalog before URL synchronization."""
    current = ROOT / 'frontend' / 'local-image-map.js'
    if current.is_file():
        mapping = json.loads(current.read_text(encoding='utf-8').split(' = ', 1)[1].strip().removesuffix(';'))
        return {slug: url for slug, url in mapping.items() if (ROOT / 'frontend' / url).is_file()}
    result = subprocess.run(
        ["git", "show", "HEAD:frontend/catalog.json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode:
        return {}
    old_catalog = json.loads(result.stdout)
    assets = ROOT / "frontend"
    return {
        wine["id"]: wine["image_url"]
        for wine in old_catalog
        if wine.get("image_url", "").startswith("./assets/")
        and (assets / wine["image_url"].removeprefix("./")).is_file()
    }


def main() -> None:
    catalog_path = ROOT / "frontend" / "catalog.json"
    local_map_path = ROOT / "frontend" / "local-image-map.js"
    csv_path = ROOT / "backend" / "data" / "catalog_cleaned.csv"

    with csv_path.open(encoding="utf-8-sig", newline="") as source:
        photos = {
            row["Slug"]: row["Название фото"].strip()
            for row in csv.DictReader(source)
            if row["Slug"]
        }
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    local_images = local_image_map()

    missing = [wine["id"] for wine in catalog if wine["id"] not in photos]
    if missing:
        raise SystemExit(f"В backend CSV отсутствуют {len(missing)} карточек фронта")

    for wine in catalog:
        photo = photos[wine["id"]]
        wine["image_url"] = local_images.get(wine["id"]) or (
            PHOTO_BASE + quote(photo) if photo else ""
        )

    local_map_path.write_text(
        "window.WINE_LOCAL_IMAGE_MAP = "
        + json.dumps(local_images, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    catalog_path.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"Обновлено {len(catalog)} карточек; локальных фото: {len(local_images)}; "
        f"URL с фотографией: {sum(bool(w['image_url']) for w in catalog)}"
    )


if __name__ == "__main__":
    main()
