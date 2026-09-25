# Ноутбуки

Пайплайн обработки данных и обучения. Запускать по порядку.

| # | Файл | Что делает | Вход | Выход | Время |
|---|------|-----------|------|-------|-------|
| 01 | `01_preprocessing.ipynb` | Парсит sitemap `Своё Вино`, матчит фото из Strapi-дампа по slug, дедуплицирует каталог, копирует референсные фото в отдельную папку | `prod-svoe-vino-strapi/`, `wines_sitemap_d778a8e06a.xml`, `strapi_output0709.csv` | `catalog_cleaned.csv`, `catalog_images/`, `alias_map.json`, `excluded_no_photo.csv` | ~3–5 мин |
| 02 | `02_yolo_train.ipynb` | Обучает YOLOv8n детектор этикеток на разметке `full_dataset_yolo/` для нормализации полевых фото | `full_dataset_yolo/` | `yolov8n.pt` (fine-tuned), `runs/detect/train*/` | ~30–60 мин на GTX 1650 |
| 03 | `03_siglip_finetune.ipynb` | Формирует пары (crop ↔ текст карточки), файнтюнит SigLIP 2 (LoRA / full) | `catalog_cleaned.csv`, `catalog_images/` | `siglip_full_best.pt`, `siglip_full_last.pt`, `train_pairs{,_train,_val}.csv` | ~1.5–2 ч |
| 04 | `04_index_and_eval.ipynb` | Строит FAISS-индекс на эмбеддингах эталонов, multi-crop запрос, OCR-реранк кандидатов, считает F1@1 / F1@5 на публичном eval-датасете | `siglip_full_best.pt`, `catalog_images/`, `eval/` | `gallery*.faiss`, `gallery_emb*.npy`, `gallery_slugs*.json`, метрики в stdout | ~5–10 мин |

## Зависимости
Общие – в `requirements.txt`. Ноутбуки не требуют отдельных пакетов.

## Данные
Исходные данные не в репо (слишком большие).

## Ограничения
- 02–03 требуют GPU ≥ 4 GB VRAM.
- 04 использует `eval/` – публичный eval от кейсодержателя.