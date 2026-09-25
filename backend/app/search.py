from urllib.parse import quote

import numpy as np
import pandas as pd
from config import CFG, PATHS
from models import embed_pair, load_indexes, load_siglip_pair, search_two
from ocr import Ocr
from PIL import Image
from textmatch import TextIndex
from ultralytics import YOLO

_COLORS = ("белое", "красное", "розовое", "оранжевое")
_COLOR_ALIASES = {
    "белый": "белое",
    "белая": "белое",
    "белое": "белое",
    "беаый": "белое",
    "6eлый": "белое",
    "красный": "красное",
    "красное": "красное",
    "розовый": "розовое",
    "розовое": "розовое",
    "оранжевый": "оранжевое",
    "оранжевое": "оранжевое",
}


def _s(v):
    return "" if pd.isna(v) else str(v).lower()


def pick_main_box(boxes, img_w, img_h, cfg=CFG):
    """Центральная целиком видимая бутылка (ТЗ: несколько бутылок в кадре)."""
    mx, my = img_w * cfg.box_margin, img_h * cfg.box_margin
    scored = []
    for b in boxes:
        x0, y0, x1, y1 = b["box"]
        cx = (x0 + x1) / 2 / img_w - 0.5
        cy = (y0 + y1) / 2 / img_h - 0.5
        cent = 1 - (cx * cx + cy * cy) ** 0.5
        area = (x1 - x0) * (y1 - y0) / (img_w * img_h)
        s = cent * cfg.box_w_cent + area * cfg.box_w_area + b["conf"] * cfg.box_w_conf
        if x0 < mx or y0 < my or x1 > img_w - mx or y1 > img_h - my:
            s *= cfg.box_edge_pen
        scored.append((s, b))
    return max(scored, key=lambda x: x[0])[1] if scored else None


class WinePipeline:
    """Все тяжёлые объекты живут один раз в памяти; запрос = лёгкий проход."""

    def __init__(self, cfg=CFG):
        self.cfg = cfg
        self.proc, self.base, self.ft = load_siglip_pair()
        self.idx_b, self.slugs_b, self.idx_f, self.slugs_f = load_indexes()
        self.yolo = YOLO(str(PATHS.yolo_pt))
        self.ocr = Ocr(cfg)
        meta = pd.read_csv(PATHS.catalog_csv).drop_duplicates("Slug").set_index("Slug")
        self.meta_rows = meta.to_dict("index")
        self.text = TextIndex(meta, cfg)

    def warmup(self):
        """Первый запрос на CPU самый дорогой - греем все компоненты заранее."""
        try:
            dummy = Image.new("RGB", (384, 384), (180, 180, 180))
            self.features(dummy)
        except Exception as e:
            print("warmup skipped:", e)

    def features(self, img):
        r = self.yolo(img, conf=self.cfg.yolo_conf, verbose=False, device="cpu")[
            0
        ]  # явный CPU
        if len(r.boxes) == 0:
            return None
        boxes = [
            {
                "conf": float(b.conf[0].cpu()),
                "box": tuple(b.xyxy[0].cpu().numpy().astype(int)),
            }
            for b in r.boxes
        ]
        best = pick_main_box(boxes, img.width, img.height)
        x0, y0, x1, y1 = best["box"]
        crop = img.crop(
            (max(0, x0), max(0, y0), min(img.width, x1), min(img.height, y1))
        )
        vb, vf = embed_pair(self.proc, self.base, self.ft, crop)
        rb, rf, cb, cf = search_two(
            self.idx_b,
            self.slugs_b,
            self.idx_f,
            self.slugs_f,
            vb,
            vf,
            self.cfg.siglip_k,
        )
        return {
            "crop": crop,
            "rank_b": rb,
            "rank_f": rf,
            "cos_b": cb,
            "cos_f": cf,
            "ocr_toks": self.ocr(crop),
            "yolo_conf": best["conf"],
        }

    def _color_penalty(self, toks, row):
        det = next((_COLOR_ALIASES[w] for w, _ in toks if w in _COLOR_ALIASES), None)
        if det is None:
            return 1.0
        pen, cat, col = 1.0, _s(row.get("Категория")), _s(row.get("Цвет"))
        if cat and det not in cat:
            pen *= self.cfg.pen_cat
        if col and det not in col:
            pen *= self.cfg.pen_color
        return pen

    def rank(self, feat, cfg=None):
        cfg = cfg or self.cfg
        if cfg.mode == "rrf":
            fused = {}
            for ranks in (feat["rank_b"], feat["rank_f"]):
                for pos, slug in enumerate(ranks, 1):
                    fused[slug] = fused.get(slug, 0.0) + 1.0 / (cfg.rrf_k + pos)
        else:
            keys = set(feat["cos_b"]) | set(feat["cos_f"])
            fused = {
                s: cfg.w_base * feat["cos_b"].get(s, 0.0)
                + cfg.w_ft * feat["cos_f"].get(s, 0.0)
                for s in keys
            }
        mx = max(fused.values()) if fused else 1.0
        sig = {s: v / mx for s, v in fused.items()}
        cand = sorted(sig, key=sig.get, reverse=True)[: cfg.siglip_k]
        forms = self.text.query_forms(feat["ocr_toks"])
        out = []
        for s in cand:
            o = self.text.score(s, forms)
            row = self.meta_rows.get(s)
            if row is not None:
                o *= self._color_penalty(feat["ocr_toks"], row)
            on = o / (o + cfg.ocr_norm)
            final = (
                (cfg.alpha * sig[s] + cfg.beta * on)
                if cfg.scoring == "linear"
                else sig[s] * (0.5 + 0.5 * on)
            )
            out.append({"slug": s, "siglip": sig[s], "ocr": o, "final": final})
        out.sort(key=lambda x: -x["final"])
        return out[: cfg.top_k]

    def predict(self, img, cfg=None):
        """Плоский JSON: slug для эвал-скрипта + поля карточки + топ-10 для фронта."""
        cfg = cfg or self.cfg
        feat = self.features(img)
        if feat is None:
            return {
                "slug": "",
                "name": "",
                "winery": "",
                "photo": "",
                "confidence": 0.0,
                "gap": 0.0,
            }
        top = self.rank(feat, cfg)
        first = top[0] if top else None
        row = self.meta_rows.get(first["slug"], {}) if first else {}
        photo = row.get("Название фото")
        out = {
            "slug": first["slug"] if first else "",
            "name": str(row.get("Название вина", "")),
            "winery": str(row.get("Винодельня", "")),
            "region": str(row.get("Регион", "")),
            "color": str(row.get("Цвет", "")),
            "photo": "" if pd.isna(photo) else self.cfg.photo_base + quote(str(photo)),
            "confidence": round(first["final"], 4) if first else 0.0,
            "gap": round(top[0]["final"] - top[1]["final"], 4) if len(top) > 1 else 0.0,
        }
        for i, it in enumerate(top, 1):
            out["top%d_slug" % i] = it["slug"]
            out["top%d_name" % i] = str(
                self.meta_rows.get(it["slug"], {}).get("Название вина", "")
            )
            out["top%d_score" % i] = round(it["final"], 4)
        return out
