from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "backend" / "app"


@pytest.fixture
def api_client(monkeypatch):
    """Load the HTTP layer with a cheap deterministic pipeline test double."""

    prediction = {
        "slug": "test-wine",
        "name": "Тестовое вино",
        "winery": "Тестовая винодельня",
        "region": "Кубань",
        "color": "Рубиновый",
        "photo": "",
        "confidence": 0.91,
        "gap": 0.12,
        "top1_slug": "test-wine",
        "top1_name": "Тестовое вино",
        "top1_score": 0.91,
    }

    class FakePipeline:
        warmed = False

        def warmup(self):
            self.warmed = True

        def predict(self, image):
            assert image.mode == "RGB"
            return prediction

    fake_search = types.ModuleType("search")
    fake_search.WinePipeline = FakePipeline
    monkeypatch.setitem(sys.modules, "search", fake_search)
    monkeypatch.syspath_prepend(str(APP_DIR))
    sys.modules.pop("main", None)
    module = importlib.import_module("main")

    with TestClient(module.app) as client:
        yield client, module, prediction

    sys.modules.pop("main", None)

