from __future__ import annotations

import io

import pytest

from PIL import Image


@pytest.mark.parametrize('mode,format', [('L', 'PNG'), ('RGBA', 'PNG'), ('RGB', 'JPEG')])
def test_image_formats_are_converted_to_rgb(api_client, monkeypatch, mode, format):
    client, module, expected = api_client
    seen = []
    def predict(image):
        seen.append((image.mode, image.size))
        return expected
    monkeypatch.setattr(module.STATE['pipe'], 'predict', predict)
    buffer = io.BytesIO()
    Image.new(mode, (23, 19)).save(buffer, format=format)
    response = client.post('/predict', files={'image': ('photo', buffer.getvalue())})
    assert response.status_code == 200
    assert seen == [('RGB', (23, 19))]


def test_pipeline_failure_does_not_break_next_request(api_client, monkeypatch):
    client, module, expected = api_client
    pipe = module.STATE['pipe']
    original = pipe.predict
    def fail(image):
        raise RuntimeError('pipeline unavailable')
    monkeypatch.setattr(pipe, 'predict', fail)
    response = client.post('/predict', files={'image': ('x.png', png_bytes())})
    assert response.status_code == 200
    assert response.json() == {'slug': '', 'error': 'pipeline unavailable'}
    monkeypatch.setattr(pipe, 'predict', original)
    assert client.post('/predict', files={'image': ('x.png', png_bytes())}).json() == expected
    assert client.get('/health').json()['ready'] is True


def test_no_detection_preserves_empty_slug(api_client, monkeypatch):
    client, module, _ = api_client
    monkeypatch.setattr(module.STATE['pipe'], 'predict', lambda image: {'slug': '', 'confidence': 0.0})
    assert client.post('/predict', files={'image': ('x.png', png_bytes())}).json() == {'slug': '', 'confidence': 0.0}


def test_unknown_route_and_wrong_method(api_client):
    client, _, _ = api_client
    assert client.get('/unknown').status_code == 404
    assert client.get('/predict').status_code == 405


def test_cors_preflight(api_client):
    client, _, _ = api_client
    response = client.options('/predict', headers={'Origin': 'http://localhost:8080', 'Access-Control-Request-Method': 'POST'})
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == '*'


def png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (120, 20, 40)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_reports_ready_after_pipeline_start(api_client):
    client, module, _ = api_client

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "ready": True}
    assert module.STATE["pipe"].warmed is True


def test_predict_accepts_multipart_image_and_returns_flat_contract(api_client):
    client, _, expected = api_client

    response = client.post(
        "/predict", files={"image": ("label.png", png_bytes(), "image/png")}
    )

    assert response.status_code == 200
    assert response.json() == expected
    assert response.json()["slug"] == response.json()["top1_slug"]


def test_predict_rejects_request_without_image(api_client):
    client, _, _ = api_client

    response = client.post("/predict", data={"comment": "no file"})

    assert response.status_code == 400
    assert response.json() == {"slug": "", "error": "no image in request"}


def test_predict_keeps_eval_contract_for_invalid_image(api_client):
    client, _, _ = api_client

    response = client.post(
        "/predict", files={"image": ("broken.jpg", b"not-an-image", "image/jpeg")}
    )

    assert response.status_code == 200
    assert response.json()["slug"] == ""
    assert response.json()["error"]
