import io
import re
from contextlib import asynccontextmanager
from urllib.parse import quote

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from search import WinePipeline
from starlette.concurrency import run_in_threadpool

STATE = {}


@asynccontextmanager
async def lifespan(app):
    pipe = WinePipeline()
    pipe.warmup()
    STATE["pipe"] = pipe
    yield
    STATE.clear()


app = FastAPI(title="Svoe Vino Scanner", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.get("/health")
def health():
    return {"status": "ok", "ready": "pipe" in STATE}


def _row_to_card(slug: str, row: dict, cfg) -> dict:
    """Сериализация строки каталога в контракт фронта (id == slug)."""
    photo = row.get("Название фото")
    grapes_raw = row.get("Сорт винограда")
    grapes = (
        [g.strip() for g in str(grapes_raw).split(",") if g.strip()]
        if not pd.isna(grapes_raw)
        else []
    )
    name = str(row.get("Название вина", ""))
    m = re.search(r"\b(19|20)\d{2}\b", name)  # Винтаж из названия, если есть
    return {
        "id": slug,
        "name": name,
        "winery": str(row.get("Винодельня", "")),
        "region": str(row.get("Регион", "")),
        "category": str(row.get("Категория", "")),
        "color_description": str(row.get("Цвет", "")),
        "grapes": grapes,
        "description": str(row.get("Описание", "")),
        "image_url": "" if pd.isna(photo) else cfg.photo_base + quote(str(photo)),
        # этих полей в CSV-дампе нет вовсе: по контракту фронта null/[], не выдумываем
        "abv": None,
        "food_pairings": [],
        "vintage": int(m.group(0)) if m else None,
        "country": None,
    }


@app.get("/wines")
def wines_list(skip: int = 0, limit: int | None = None):
    rows = STATE["pipe"].meta_rows
    items = list(rows.items())[skip:]
    if limit is not None:
        items = items[:limit]
    return {
        "items": [_row_to_card(s, r, STATE["pipe"].cfg) for s, r in items],
        "total": len(rows),
    }


@app.get("/wines/{wine_id}")
def wine_card(wine_id: str):
    row = STATE["pipe"].meta_rows.get(wine_id)
    if row is None:
        raise HTTPException(404, "Вино не найдено")
    return _row_to_card(wine_id, row, STATE["pipe"].cfg)


@app.post("/predict")
async def predict(request: Request):
    form = await request.form()
    uploads = [v for v in form.values() if hasattr(v, "read")]
    if not uploads:
        return JSONResponse(
            {"slug": "", "error": "no image in request"}, status_code=400
        )
    data = await uploads[0].read()
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        result = await run_in_threadpool(STATE["pipe"].predict, img)
    except Exception as e:
        return JSONResponse({"slug": "", "error": str(e)})
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
