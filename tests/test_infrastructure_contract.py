from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_backend_entrypoint_artifacts_exist_and_are_materialized():
    script = (ROOT / "docker" / "backend-entrypoint.sh").read_text(encoding="utf-8")
    container_paths = re.findall(r"^/app/backend/artifacts/\S+$", script, re.MULTILINE)

    assert len(container_paths) == 6
    for container_path in container_paths:
        relative = container_path.removeprefix("/app/backend/")
        artifact = ROOT / "backend" / relative
        assert artifact.stat().st_size > 1_000, artifact
        with artifact.open("rb") as source:
            prefix = source.read(64)
        assert not prefix.startswith(b"version https://git-lfs.github.com/spec/v1"), artifact


def test_frontend_and_nginx_api_routes_match():
    api = (ROOT / "frontend" / "api.js").read_text(encoding="utf-8")
    nginx = (ROOT / "docker" / "nginx.conf").read_text(encoding="utf-8")

    assert "request('/wines')" in api
    assert "request('/scan'" in api
    assert "location = /api/wines" in nginx
    assert "location = /api/scan" in nginx
    assert "proxy_pass http://wine_backend/predict;" in nginx
    assert "location /api/assets/" in nginx


def test_container_shell_scripts_use_unix_line_endings():
    for name in ("backend-entrypoint.sh", "frontend-entrypoint.sh"):
        data = (ROOT / "docker" / name).read_bytes()
        assert data.startswith(b"#!/bin/sh\n")
        assert b"\r\n" not in data
