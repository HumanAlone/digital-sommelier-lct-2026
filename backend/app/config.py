"""Пути и гиперпараметры: единая точка правды для прода и офлайн-эвала."""

from dataclasses import dataclass, field
from pathlib import Path


def find_root() -> Path:
    p = Path(__file__).resolve().parent
    for cand in [p, *p.parents]:
        if (cand / "artifacts").exists():
            return cand
    raise FileNotFoundError("artifacts/ not found above " + str(p))


ROOT = find_root()


def _pick(name, *subs):
    for sub in subs:
        cand = ROOT / sub / name if sub else ROOT / name
        if cand.exists():
            return cand
    raise FileNotFoundError(
        name + " not found in: " + ", ".join(s or "<root>" for s in subs)
    )


@dataclass(frozen=True)
class Paths:
    yolo_pt: Path = _pick("best.pt", "artifacts/models", "artifacts")
    siglip_ft_pt: Path = _pick("siglip_full_best.pt", "artifacts/models", "artifacts")
    recall_idx: Path = _pick("gallery.faiss", "artifacts/index", "artifacts")
    rerank_idx: Path = _pick("gallery_finetuned.faiss", "artifacts/index", "artifacts")

    recall_slugs: Path = _pick("gallery_slugs.json", "artifacts/index", "artifacts")
    rerank_slugs: Path = _pick(
        "gallery_slugs_finetuned.json", "artifacts/index", "artifacts"
    )
    catalog_csv: Path = _pick("catalog_cleaned.csv", "data", "")
    gt_csv: Path = _pick("eval_slugs_new.csv", "data", "")
    eval_dir: Path = _pick("eval_with_slugs", "data", "")
    crops_dir: Path = _pick("ref_crops", "data", "")


@dataclass(frozen=True)
class Cfg:
    model_name: str = "google/siglip2-base-patch16-384"
    photo_base: str = (
        "https://api.vino-svoe.ru/v1/img/str-api/1920/1920/resize/uploads/"
    )
    yolo_conf: float = 0.25
    siglip_k: int = 100  # кандидатов до OCR-скоринга; первый рубильник скорости
    top_k: int = 10
    rrf_k: int = 60
    w_base: float = 0.8
    w_ft: float = 0.2
    alpha: float = 0.6
    beta: float = 0.4
    ocr_norm: float = 40.0
    scoring: str = "linear"  # 'linear' | 'mul'
    mode: str = "score"  # 'score' | 'rrf'
    ocr_conf_min: float = 0.5
    fuzzy_ratio: float = 0.85
    box_w_cent: float = 0.45
    box_w_area: float = 0.35
    box_w_conf: float = 0.20
    box_edge_pen: float = 0.5
    box_margin: float = 0.02
    pen_cat: float = 0.5
    pen_color: float = 0.7
    torch_threads: int = 0  # 0 = авто; на CPU стоит ставить = числу физических ядер
    field_weights: dict = field(
        default_factory=lambda: {
            "Название вина": 2.0,
            "Сорт винограда": 3.5,
            "Винодельня": 1.5,
            "Цвет": 2.0,
            "Категория": 1.5,
            "Регион": 3.0,
        }
    )


PATHS, CFG = Paths(), Cfg()
