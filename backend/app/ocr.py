import re

import cv2
import numpy as np
from config import CFG
from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR
from textmatch import STOPWORDS, is_year, norm


class Ocr:
    def __init__(self, cfg=CFG):
        self.cfg = cfg
        self.reader = RapidOCR(
            params={
                "Rec.lang_type": LangRec.CYRILLIC,
                "Rec.model_type": ModelType.MOBILE,
                "Rec.ocr_version": OCRVersion.PPOCRV5,
            }
        )

    @staticmethod
    def _unpack(res):
        if res is None:
            return [], []
        if (
            isinstance(res, tuple) and len(res) == 3
        ):  # старый API: (boxes, texts, scores)
            _, txts, scores = res
            return list(txts or []), list(scores or [])
        if hasattr(res, "txts") and hasattr(res, "scores"):  # новый API: объект
            return list(res.txts or []), list(res.scores or [])
        raise TypeError("неизвестный формат результата RapidOCR: %s" % type(res))

    @staticmethod
    def preprocess(img):
        a = np.array(img.convert("RGB"))
        lab = cv2.cvtColor(a, cv2.COLOR_RGB2LAB)
        lab[:, :, 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(
            lab[:, :, 0]
        )
        out = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
        mean = out.reshape(-1, 3).mean(axis=0, keepdims=True) + 1e-6
        return np.clip(out * (128.0 / mean), 0, 255).astype(np.uint8)

    def __call__(self, img):
        toks = []
        txts, scores = self._unpack(self.reader(self.preprocess(img)))
        for text, conf in zip(txts, scores):
            conf = float(conf)
            if conf < self.cfg.ocr_conf_min:
                continue
            for w in norm(text).split():
                if len(w) < 3 or w.isdigit() or is_year(w) or w in STOPWORDS:
                    continue
                toks.append((w, conf))
        return toks
