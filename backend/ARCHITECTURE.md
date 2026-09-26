# Архитектура

Документ описывает пайплайн и границы слоёв: нормализация фото, извлечение признаков,
поиск по каталогу, выдача карточки, дополнительные функции. Практический запуск –
в [README.md](README.md).

## Обзор и путь запроса

```mermaid
flowchart TD
    A["📷 Фото (multipart, field: image)"]

    subgraph S1["1. НОРМАЛИЗАЦИЯ"]
        B1["YOLOv8 (best.pt)<br/>боксы бутылок"]
        B2["pick_main_box → кроп"]
        B3["CLAHE + gray-world WB<br/>(ветка для OCR)"]
        B1 --> B2
        B2 --> B3
    end

    subgraph S2["2. ПРИЗНАКИ"]
        C1["SigLIP2 base"]
        C2["SigLIP2 ft"]
        C3["L2-норм. эмбеддинги<br/>(fp32, CPU)"]
        C1 --> C3
        C2 --> C3
    end

    subgraph S3["3. ПОИСК ПО КАТАЛОГУ"]
        D1["FAISS recall<br/>(base, top-100)"]
        D2["FAISS rerank<br/>(ft, top-100)"]
        D3["Фьюжн → siglip-скор ∈ [0,1]"]
        D4["RapidOCR → токены<br/>IDF / транслит / скелетоны / fuzzy"]
        D5["OCR-скор +<br/>штраф цвета/категории"]
        D6["final = α·siglip + β·ocr_norm<br/>→ топ-10"]
        D1 --> D3
        D2 --> D3
        D4 --> D5
        D3 --> D6
        D5 --> D6
    end

    subgraph S4["4. КАРТОЧКА"]
        E1["slug + поля каталога<br/>+ photo (CDN)<br/>+ confidence / gap"]
    end

    subgraph S5["5. ДОП. ФУНКЦИИ"]
        F1["Топ-10 для экрана<br/>«не уверены»"]
        F2["/wines и /wines/{id}<br/>для UI"]
    end

    A --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5

    classDef io fill:#e3f2fd,stroke:#1565c0,color:#000
    classDef norm fill:#fff3e0,stroke:#ef6c00,color:#000
    classDef feat fill:#e8f5e9,stroke:#2e7d32,color:#000
    classDef search fill:#f3e5f5,stroke:#6a1b9a,color:#000
    classDef card fill:#fce4ec,stroke:#ad1457,color:#000
    classDef extra fill:#eceff1,stroke:#455a64,color:#000

    class A io
    class B1,B2,B3 norm
    class C1,C2,C3 feat
    class D1,D2,D3,D4,D5,D6 search
    class E1 card
    class F1,F2 extra
```

## Границы слоёв

| Слой | Файл | Вход → выход |
|---|---|---|
| Конфигурация | `app/config.py` | – → `Paths` (автопоиск артефактов), `Cfg` (все гиперпараметры) |
| Модели и индексы | `app/models.py` | веса/индексы с диска → два энкодера, FAISS, `search_two` |
| Нормализация + поиск | `app/search.py` (`WinePipeline`) | PIL-изображение → features → ранжированный топ-10 → плоский JSON |
| OCR | `app/ocr.py` | кроп → токены с уверенностью (порог `ocr_conf_min`) |
| Текстовый матчинг | `app/textmatch.py` | токены запроса + каталог → ocr-скор (IDF, транслит, скелетоны, fuzzy) |
| HTTP | `app/main.py` | multipart/GET → JSON; сериализация карточки; CORS |


## [1] Нормализация входного фото

- Детекция: YOLOv8, дообученная на кропах этикеток (`artifacts/models/best.pt`),
  порог `yolo_conf=0.25`.
- Выбор главной бутылки (`pick_main_box`): эвристика «центральная и целиком видимая»
  скор = 0.45·центральность + 0.35·площадь + 0.20·conf, штраф ×0.5 за касание краёв
  (margin 2%). Веса – в `Cfg`.
- Для SigLIP: препроцессинг процессора модели (resize 384, patch16).
- Для OCR: CLAHE (clip 2.0, сетка 8×8) по L-каналу + gray-world white balance –
  компенсация разного света и угла съёмки «живых» фото.

## [2] Извлечение признаков

- Энкодер: SigLIP2 base-patch16-384, пул-выход, L2-нормализация → косинусное
  сходство как dot product в FAISS IndexFlatIP.
- Две модели: base (ступень recall) и дообученная на каталоге (ступень rerank).
- CPU-режим: fp32, без autocast; один препроцессинг изображения на оба энкодера.

## [3] Поиск по каталогу

Двухступенчатая схема retrieval:
- **Ступень recall:** base-эмбеддинг → FAISS `gallery.faiss`, top-100.
- **Ступень rerank:** ft-эмбеддинг → FAISS `gallery_finetuned.faiss`, top-100.
- Фьюжн визуального: `score` (0.8·cos_base + 0.2·cos_ft, дефолт) или `rrf`
  (k=60); результат нормируется делением на максимум → siglip-скор ∈ [0,1]
  в обоих режимах (режимы сравнимы напрямую).
- OCR-ветка: RapidOCR (кириллица, PP-OCRv5 mobile) → токены (порог уверенности
  0.5, стоп-слова, годы отбрасываются) → скоринг по каталогу.
- Штраф цвета/категории: если OCR увидел «белое», а позиция красная – скор
  домножается на 0.5/0.7; при пустой категории в каталоге штраф не применяется.
- Итог: `final = α·siglip + β·ocr/(ocr+ocr_norm)`, дефолт α=0.6, β=0.4,
  ocr_norm=40; альтернатива – мультипликативная схема (`scoring='mul'`).
  Отбор кандидатов до OCR-скоринга: top-`siglip_k`=100.

## [4] Выдача карточки

**Эндпоинты:**

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/predict` | Распознавание фото → плоский JSON: `slug`, поля карточки, `confidence`, `gap`, `top1…topN` |
| `GET` | `/wines` | Список карточек каталога (пагинация `skip`/`limit`) |
| `GET` | `/wines/{id}` | Карточка по `slug`; `404 {"detail": …}`, если нет |
| `GET` | `/health` | Статус и готовность пайплайна |

## [5] Дополнительные функции после поиска

Реализовано:
- топ-10 кандидатов в ответе;
- метрики уверенности (`confidence`, `gap`);
- каталог и карточка (`/wines`, `/wines/{id}`, `/images/{filename}`).
