from __future__ import annotations

import csv
import json
from pathlib import Path


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


def test_every_declared_frontend_image_exists():
    catalog = json.loads((ROOT / "frontend" / "catalog.json").read_text(encoding="utf-8"))

    missing = []
    for wine in catalog:
        if not wine["image_url"]:
            continue
        relative = wine["image_url"].removeprefix("./")
        if not (ROOT / "frontend" / relative).is_file():
            missing.append((wine["id"], relative))

    assert missing == []


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

