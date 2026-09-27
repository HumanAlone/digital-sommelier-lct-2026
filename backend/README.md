# Backend и ML-пайплайн

FastAPI-сервис для распознавания российских вин по фотографии этикетки и выдачи данных каталога. Он используется фронтендом «Своё Вино».

Пайплайн: YOLO выделяет бутылку или этикетку, SigLIP и FAISS ищут визуально близкие позиции, OCR уточняет результат по тексту этикетки. Подробная схема: [ARCHITECTURE.md](ARCHITECTURE.md).

## Метрики публичного eval-набора

| Метрика | Значение |
| --- | --- |
| F1@top-1 | 0.9091 |
| Accuracy@top-10 | 0.9818 |

Метрики относятся к подготовленному публичному eval-набору и не гарантируют такую же точность на любом полевом снимке.

## Требования

- Python 3.11;
- не менее 4 ГБ RAM;
- Git LFS для моделей и индексов;
- GPU не обязателен: инференс рассчитан на CPU.

Перед запуском из корня репозитория скачайте LFS-файлы:

```powershell
git lfs pull
```

В `backend/artifacts/` должны быть веса YOLO и SigLIP, два FAISS-индекса и файлы slug-идентификаторов. Каталог `backend/data/catalog_cleaned.csv` — обязательная runtime-зависимость.

## Локальный запуск без Docker

Из корня репозитория:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --app-dir backend/app --host 0.0.0.0 --port 8000 --workers 1
```

Первый старт занимает время на загрузку моделей и warmup. Проверка готовности:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Используйте один воркер: каждый дополнительный воркер загрузит собственную копию моделей в память.

## API

### `POST /predict`

Принимает `multipart/form-data` с фотографией. Фронтенд передаёт файл в поле `image`; сервер берёт первый загруженный файл.

```powershell
curl.exe -X POST -F "image=@photo.jpg" http://127.0.0.1:8000/predict
```

Ответ содержит лучший вариант, показатели уверенности и ближайших кандидатов:

```json
{
  "slug": "wine-slug",
  "confidence": 0.7849,
  "gap": 0.082,
  "top1_slug": "wine-slug",
  "top1_score": 0.7849,
  "top2_slug": "another-wine-slug",
  "top2_score": 0.7021
}
```

`slug` — лучший результат. `confidence` показывает оценку уверенности, `gap` — разрыв между первым и вторым кандидатом. Фронтенд открывает карточку сразу при уверенном результате; при `confidence < 0.65` или `gap < 0.08` показывает пользователю несколько кандидатов для выбора.

Если вино не распознано, сервер возвращает пустой `slug`.

### `GET /wines`

Возвращает каталог. Необязательные параметры: `skip` и `limit`.

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/wines?skip=0&limit=50"
```

Ответ содержит `items` и `total`. Карточка включает `id`, `name`, `winery`, `region`, `category`, `color_description`, `grapes`, `description` и `image_url`.

### `GET /wines/{id}`

Возвращает одну карточку по slug. Если вина нет, сервер отдаёт HTTP 404.

### `GET /health`

Возвращает состояние загрузки пайплайна:

```json
{ "status": "ok", "ready": true }
```

## Код

| Путь | Назначение |
| --- | --- |
| `app/main.py` | FastAPI и HTTP-маршруты |
| `app/search.py` | `WinePipeline`: признаки, ранжирование и JSON-ответ |
| `app/models.py` | YOLO, SigLIP и FAISS |
| `app/ocr.py` | OCR и препроцессинг текста |
| `app/textmatch.py` | Текстовый скоринг кандидатов |
| `app/config.py` | Пути к артефактам и параметры пайплайна |
| `notebooks/` | Подготовка данных, обучение, индексы и eval |

Docker-способ запуска описан в основном [README](../README.md) и [docs/INFRASTRUCTURE.md](../docs/INFRASTRUCTURE.md).
