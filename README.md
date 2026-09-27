# Своё Вино

Мобильный веб-сервис для поиска российских вин по фотографии этикетки. Проект создан для кейса «РСХБ.Цифра» 2026.

Пользователь снимает этикетку камерой или загружает фото из галереи. ML-пайплайн находит вино в каталоге, а сайт открывает его карточку с фотографией, описанием, регионом, винодельней и сортами винограда.

Дизайн основан на [макете в Figma](https://www.figma.com/design/H0r9OoU4iYj1ehbgdAFRDE/%D0%A1%D0%B2%D0%BE%D1%91-%D0%92%D0%B8%D0%BD%D0%BE-%E2%80%94-Wine-Scanner?node-id=0-1).

## Что умеет сайт

- Каталог из 2 103 российских вин с локальными фотографиями.
- Поиск и фильтры по названию, винодельне, региону и сортам винограда.
- Карточка вина, похожие вина и сравнение двух позиций.
- Камера браузера и загрузка фотографии из галереи.
- Распознавание через `POST /predict`.
- Экран выбора вариантов, когда модель недостаточно уверена в результате.
- Избранное, история просмотров, подборки, винный дневник, паспорт вкуса и простой цифровой сомелье.

Избранное, история, подборки и заметки сохраняются в `localStorage` текущего браузера. Регистрации, входа и серверного аккаунта в проекте нет.

## Структура

| Папка | Содержимое |
| --- | --- |
| [`frontend/`](frontend/) | Статический интерфейс, камера, каталог, локальные фотографии и API-клиент |
| [`backend/`](backend/) | FastAPI и ML-пайплайн YOLO, SigLIP, FAISS и OCR |
| [`docker/`](docker/) | Nginx и скрипты запуска контейнеров |
| [`docs/`](docs/) | Контракт API, инфраструктура и тест-кейсы |
| [`tests/`](tests/) | Python- и JavaScript-тесты |
| [`scripts/`](scripts/) | Служебные скрипты импорта и проверки фотографий |

## Быстрый просмотр фронтенда

Нужен Python 3. Из корня репозитория:

```powershell
python -m http.server 5173 --directory frontend
```

Откройте [http://localhost:5173](http://localhost:5173).

Для просмотра каталога без API временно задайте в [`frontend/config.js`](frontend/config.js):

```js
window.WINE_API_BASE = '';
```

После этого обновите страницу с `Ctrl + F5`. Камера работает на `localhost` или по HTTPS; если доступ запрещён, можно выбрать фото из галереи.

## Запуск полного приложения в Docker

Нужны Docker Desktop и Git LFS. Сначала скачайте ML-артефакты:

```powershell
git lfs pull
Copy-Item .env.example .env
docker compose up --build
```

Сайт откроется на [http://localhost:8080](http://localhost:8080). Nginx передаёт `/wines`, `/wines/{id}` и `/predict` в FastAPI. API напрямую доступно на [http://localhost:8000](http://localhost:8000), а проверка готовности — на `/health`.

Подробные настройки контейнеров: [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md).

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/wines` | Каталог вин; поддерживает `skip` и `limit` |
| `GET` | `/wines/{id}` | Полная карточка одного вина |
| `POST` | `/predict` | Распознавание фото из multipart-поля `image` |
| `GET` | `/health` | Готовность ML-пайплайна |

`/predict` возвращает лучший `slug`, показатели `confidence` и `gap`, а также до десяти ближайших кандидатов. При уверенном результате фронт открывает карточку сразу. Если уверенность ниже `0.65` или разрыв с ближайшим кандидатом меньше `0.08`, фронт предлагает пользователю выбрать бутылку из вариантов ML.

Полные примеры запросов и ответов: [backend/README.md](backend/README.md).

## Фотографии каталога

Все 2 103 карточки используют локальные изображения из переданного датасета. Соответствие `id → файл` хранится в [`frontend/local-image-map.js`](frontend/local-image-map.js), поэтому карточки не зависят от внешнего сервера фотографий. Отчёт импорта: [docs/photo-import-report.json](docs/photo-import-report.json).

Повторный импорт фото из multipart-архива Strapi:

```powershell
python scripts/restore_catalog_photos.py "C:/путь/к/prod-svoe-vino-strapi.part1.rar"
```

Скрипту нужен WinRAR с `UnRAR.exe` и все части архива рядом с первой частью.

## Тесты

```powershell
python -m pip install -r requirements-ci.txt
python -m pytest -q
node --test --experimental-test-isolation=none tests/frontend/*.test.mjs
```

Подробнее: [tests/README.md](tests/README.md) и [docs/TEST_CASES.md](docs/TEST_CASES.md).
