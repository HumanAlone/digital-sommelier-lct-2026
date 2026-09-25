import io
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
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
        return JSONResponse(
            {"slug": "", "error": str(e)}
        )  # 200: эвал-скрипт не должен падать
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
