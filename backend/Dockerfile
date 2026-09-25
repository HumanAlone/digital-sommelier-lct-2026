FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/var/cache/huggingface \
    TRANSFORMERS_CACHE=/var/cache/huggingface

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && grep -v -E '^(torch|torchvision)(\r)?$' /tmp/requirements.txt > /tmp/requirements-runtime.txt \
    && python -m pip install -r /tmp/requirements-runtime.txt

WORKDIR /app/backend
COPY backend/app ./app
COPY backend/data/catalog_cleaned.csv ./data/catalog_cleaned.csv
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint

# Fail during image build if a required runtime dependency or Python module is
# incompatible. Importing application modules themselves is deferred because
# ML artifacts are mounted only when the container starts.
RUN python -m compileall -q app \
    && python -c "import cv2, faiss, numpy, pandas, torch, transformers, ultralytics; from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR"

RUN mkdir -p data/eval_with_slugs data/ref_crops /var/cache/huggingface \
    && touch data/eval_slugs_new.csv \
    && chmod +x /usr/local/bin/backend-entrypoint

EXPOSE 8000
ENTRYPOINT ["backend-entrypoint"]
CMD ["uvicorn", "main:app", "--app-dir", "/app/backend/app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
