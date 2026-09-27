from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]


def test_frontend_catalog_has_unique_complete_records():
    catalog = json.loads((ROOT / "frontend" / "catalog.json").read_text(encoding="utf-8"))
    required = {
        "id",
        "name",
        "category",
        "color_description",
        "region",
        "grapes",
        "description",
        "winery",
        "image_url",
    }

    assert len(catalog) == 2103
    assert len({wine["id"] for wine in catalog}) == len(catalog)
    assert all(set(wine) == required for wine in catalog)
    assert all(wine["id"] and wine["name"] and wine["description"] for wine in catalog)


def test_frontend_image_urls_match_backend_catalog():
    catalog = json.loads((ROOT / "frontend" / "catalog.json").read_text(encoding="utf-8"))
    with (ROOT / "backend" / "data" / "catalog_cleaned.csv").open(
        encoding="utf-8-sig", newline=""
    ) as source:
        photos = {row["Slug"]: row["Название фото"] for row in csv.DictReader(source)}

    base = "https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/"
    local_map = (ROOT / "frontend" / "local-image-map.js").read_text(encoding="utf-8")
    assert local_map.startswith("window.WINE_LOCAL_IMAGE_MAP = ")
    local_images = json.loads(local_map.removeprefix("window.WINE_LOCAL_IMAGE_MAP = ").removesuffix(";\n"))
    assert set(local_images) == {wine['id'] for wine in catalog}
    assert all(
        wine["image_url"] == local_images.get(wine["id"], base + quote(photos[wine["id"]]))
        for wine in catalog
    )
    assert all((ROOT / "frontend" / path.removeprefix("./")).is_file() for path in local_images.values())


def test_all_catalog_photographs_decode():
    from PIL import Image
    catalog = json.loads((ROOT / 'frontend/catalog.json').read_text(encoding='utf-8'))
    for url in {wine['image_url'] for wine in catalog}:
        assert url.startswith('./assets/wines/')
        with Image.open(ROOT / 'frontend' / url) as photo:
            photo.load()
            assert photo.width > 0 and photo.height > 0


def test_frontend_and_backend_use_the_same_wine_ids():
    frontend = json.loads((ROOT / "frontend" / "catalog.json").read_text(encoding="utf-8"))
    with (ROOT / "backend" / "data" / "catalog_cleaned.csv").open(
        encoding="utf-8-sig", newline=""
    ) as source:
        backend_ids = {row["Slug"] for row in csv.DictReader(source) if row["Slug"]}

    assert {wine["id"] for wine in frontend} == backend_ids


def test_search_indexes_reference_only_catalog_wines():
    with (ROOT / "backend" / "data" / "catalog_cleaned.csv").open(
        encoding="utf-8-sig", newline=""
    ) as source:
        catalog_ids = {row["Slug"] for row in csv.DictReader(source) if row["Slug"]}

    recall = json.loads(
        (ROOT / "backend" / "artifacts" / "gallery_slugs.json").read_text(encoding="utf-8")
    )
    rerank = json.loads(
        (ROOT / "backend" / "artifacts" / "gallery_slugs_finetuned.json").read_text(
            encoding="utf-8"
        )
    )

    assert recall == rerank
    assert len(recall) == len(set(recall))
    assert set(recall) <= catalog_ids
