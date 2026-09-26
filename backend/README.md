# Сканер российских вин с описанием на платформе Свое Вино

Кейс «Лидеры цифровой трансформации 2026» (РСХБ.Цифра). Покупатель у полки
наводит камеру на этикетку – сервис находит позицию в каталоге «Своё Вино»
и отдаёт карточку вина: производитель, регион, сорт, описание, рейтинг.

Подробности и границы слоёв – в [ARCHITECTURE.md](ARCHITECTURE.md).

## Метрики (публичный eval-датасет)

| Метрика | Значение |
|---|---|
| F1 @ top-1 | 0.9091 |
| Accuracy @ top-10 | 0.9818 |

## Структура репозитория

```text
backend/
├── app/                  # Прод: HTTP + ML-пайплайн
│   ├── config.py         # Автопоиск путей + все гиперпараметры (Cfg)
│   ├── models.py         # SigLIP2 base+ft, FAISS-индексы, поиск
│   ├── ocr.py            # RapidOCR: препроцессинг, порог уверенности
│   ├── textmatch.py      # Токены каталога, IDF, транслит, скелетоны, OCR-скоринг
│   ├── search.py         # WinePipeline: детекция → эмбеддинги → фьюжн → JSON
│   └── main.py           # FastAPI: /predict, /wines, /wines/{id}, /images, /health
├── artifacts/            # Вне git: веса и индексы
│   ├── models/           # best.pt (YOLO), siglip_full_best.pt
│   ├── index/            # gallery.faiss, gallery_finetuned.faiss
│   ├── gallery_slugs.json
│   ├── gallery_slugs_finetuned.json
├── data/                 # catalog_cleaned.csv
├── notebooks/            # Исследовательский контур: сборка индексов и дообучение
├── .gitignore
├── README.md
├── Dockerfile
└── ARCHITECTURE.md
```

## Требования

- Python 3.11
- GPU не требуется: инференс рассчитан на CPU
- RAM: ≥ 4 ГБ (два энкодера SigLIP2 + YOLO + FAISS-индексы + OCR-модели)

> **Критично:** пакет `python-multipart` обязателен.  
> Входит в `requirements.txt`; при выборочной установке пакетов – ставить вручную.

## Сетап

1. Склонируйте репозиторий.
2. Артефакты и данные (веса и индексы ~1,5 ГБ).

   ```text
   artifacts/models/best.pt                  # YOLOv8, дообученная детекция этикеток
   artifacts/models/siglip_full_best.pt      # SigLIP2, дообученная на каталоге
   artifacts/index/gallery.faiss             # Индекс ступени recall (base)
   artifacts/index/gallery_finetuned.faiss   # Индекс ступени rerank (finetuned)
   artifacts/gallery_slugs.json              # Слаги в порядке индекса recall
   artifacts/gallery_slugs_finetuned.json    # Слаги в порядке индекса rerank
   data/catalog_cleaned.csv                  # Каталог: читается сервером на старте
   ```

   Пути ищутся автоматически (`app/config.py`), жёсткой привязки к структуре нет.

   > `data/catalog_cleaned.csv` – runtime-зависимость, а не исследовательские данные.

3. Установите зависимости:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
   ```

4. Запустите сервер:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
   ```

   Старт 20–60 c (загрузка моделей + warmup). Готовность:
   `GET /health` → `{"status":"ok","ready":true}`.
   `--workers 1` обязателен: каждый воркер поднял бы свою копию моделей в RAM.

## API

### POST /predict
Распознавание по фото. Multipart/form-data; имя поля с файлом любое
(`image`, `file`, …) – берётся первый загруженный файл.

Ответ – плоский JSON:

```json
{
  "slug": "denisov_rubin_klaret_krasnaya_strelka",
  "name": "Рубин кларет . Красная стрелка",
  "winery": "Denisov Winery",
  "region": "Самара",
  "color": "Ярко-рубиновый  цвет",
  "photo": "https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/....webp",
  "confidence": 0.7849,
  "gap": 0.0047,
  "top1_slug": "denisov_rubin_klaret_krasnaya_strelka",
  "top1_name": "Рубин кларет . Красная стрелка",
  "top1_score": 0.7849,
  "top2_slug": "denisov_pino_noir_klaret",
  "top2_name": "Пино Нуар кларет. Красная стрелка",
  "top2_score": 0.7801
}
```

- `slug` – лучший результат; поле, которое читает оценочный скрипт кейсодержателя;
- `confidence`, `gap` – уверенность и отрыв от 2-го места (метрика уверенности в API
  по ТЗ; в UI не требуется). Фронтенд использует их для экрана «не уверены»;
- `top1…top10` (`_slug`, `_name`, `_score`) – ближайшие кандидаты для UI;
- если бутылка не найдена – `{"slug": "", …}` при HTTP 200: оценочный прогон не
  прерывается, фронтенд трактует пустой `slug` как «не распознано».

Пример:

```bash
curl -s -X POST -F "image=@photo.jpg" http://127.0.0.1:8000/predict
```

### GET /wines
Каталог вин. Пагинация опциональна: `?skip=0&limit=50`; без параметров отдаётся весь каталог. Ответ:

```json
{
  "total": 2103,
  "items": [
    {
      "id": "denisov_rubin_klaret_krasnaya_strelka",
      "name": "Рубин кларет . Красная стрелка",
      "winery": "Denisov Winery",
      "region": "Самара",
      "category": "Розовое",
      "color_description": "Ярко-рубиновый  цвет",
      "grapes": ["Рубин Голодриги", "Цитронный Магарача"],
      "description": "...",
      "image_url": "https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/....webp",
      "abv": null,
      "food_pairings": [],
      "vintage": null,
      "country": null
    }
  ]
}
```

Пример:

```bash
curl -s "http://127.0.0.1:8000/wines?skip=0&limit=50"
```

### GET /wines/{id}
Карточка вина с теми же полями. Позиция не найдена – HTTP 404 с телом
`{"detail": "Вино не найдено"}`.

Пример:

```bash
curl -s http://127.0.0.1:8000/wines/denisov_rubin_klaret_krasnaya_strelka
```

### GET /health
Готовность сервиса.

Пример:

```bash
curl -s http://127.0.0.1:8000/health
```

## Конфигурация

Пути к артефактам находятся автоматически, все гиперпараметры собраны
в dataclass `Cfg` там же (веса фьюжна, пороги OCR, top-k, веса выбора бокса,
photo-URL базы).

## Документация репозитория

- [ARCHITECTURE.md](ARCHITECTURE.md) – пайплайн и границы слоёв.
- [notebooks/README.md](notebooks/README.md) – исследовательский контур: подготовка данных, дообучение
  YOLO и SigLIP, сборка индексов, eval. Прод-код в `app/`, точка входа – [`app/main.py`](app/main.py).
