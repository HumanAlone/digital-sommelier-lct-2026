import math
import re
from collections import defaultdict

from config import CFG
from rapidfuzz.distance import Levenshtein
from rapidfuzz.fuzz import ratio as fz_ratio

STOPWORDS = frozenset(
    """вино вин год года урожай урожая россия россии произведено изготовлено
алк спирт об объём мл л литр литров алкоголь производство завод компания винодельня
виноград винограда сортовое столовое марочное выдержанное выдержка выдержку знак качество
гост ту декларация сертификат акциз штрих код номер дата розлив разлито бутылка бутылки
ёмкость температура хранение хранить употребить до после вскрытия охлаждать подавать
рекомендуется подача градусов градуса процентов процента оборотов оборота спирта
этиловый этилового ректификат ректификата дистиллят дистиллята виноградный виноградного
сусло сусла виноматериал виноматериала""".split()
)

_CYR2LAT = dict(
    zip(
        "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        [
            "a",
            "b",
            "v",
            "g",
            "d",
            "e",
            "e",
            "zh",
            "z",
            "i",
            "y",
            "k",
            "l",
            "m",
            "n",
            "o",
            "p",
            "r",
            "s",
            "t",
            "u",
            "f",
            "kh",
            "ts",
            "ch",
            "sh",
            "shch",
            "",
            "y",
            "",
            "e",
            "yu",
            "ya",
        ],
    )
)
_LAT2CYR2 = {
    "zh": "ж",
    "kh": "х",
    "ts": "ц",
    "ch": "ч",
    "sh": "ш",
    "shch": "щ",
    "yu": "ю",
    "ya": "я",
}
_LAT2CYR1 = {
    "a": "а",
    "b": "б",
    "c": "к",
    "d": "д",
    "e": "е",
    "f": "ф",
    "g": "г",
    "h": "х",
    "i": "и",
    "j": "й",
    "k": "к",
    "l": "л",
    "m": "м",
    "n": "н",
    "o": "о",
    "p": "п",
    "q": "к",
    "r": "р",
    "s": "с",
    "t": "т",
    "u": "у",
    "v": "в",
    "w": "в",
    "x": "кс",
    "y": "и",
    "z": "з",
}

CANON = {
    "a": "a",
    "а": "a",
    "c": "c",
    "с": "c",
    "e": "e",
    "е": "e",
    "o": "o",
    "о": "o",
    "0": "o",
    "p": "p",
    "р": "p",
    "y": "y",
    "у": "y",
    "x": "x",
    "х": "x",
    "k": "k",
    "к": "k",
    "m": "m",
    "м": "m",
    "т": "m",
    "h": "h",
    "н": "h",
    "u": "u",
    "и": "u",
    "b": "b",
    "б": "b",
    "6": "b",
    "z": "z",
    "з": "z",
    "3": "z",
    "n": "n",
    "п": "n",
    "r": "r",
    "г": "r",
    "ь": "ь",
    "ъ": "ь",
}
_SKEL = str.maketrans(CANON)


def norm(s):
    s = str(s).lower().replace("ё", "е")
    return re.sub(r"[^a-zа-я0-9]+", " ", s).strip()


def is_year(t):
    return bool(re.fullmatch(r"(19|20)\d{2}", t))


def skeleton(w):
    return w.translate(_SKEL)


def cyr_to_lat(s):
    return "".join(_CYR2LAT.get(c, c) for c in s)


def lat_to_cyr(s):
    out, i = [], 0
    while i < len(s):
        if s[i : i + 2] in _LAT2CYR2:
            out.append(_LAT2CYR2[s[i : i + 2]])
            i += 2
        else:
            out.append(_LAT2CYR1.get(s[i], s[i]))
            i += 1
    return "".join(out)


def translit_variants(word):
    variants = {word}
    if all("а" <= c <= "я" or c == "ё" for c in word):
        variants.add(cyr_to_lat(word))
    elif all("a" <= c <= "z" for c in word):
        variants.add(lat_to_cyr(word))
    return variants


class TextIndex:
    """Токены каталога + IDF + кэш canon. Строится один раз на старте."""

    def __init__(self, meta, cfg=CFG):
        self.cfg = cfg
        self.slug_tokens, self.token_to_slugs, self.field_w = {}, defaultdict(set), {}
        for slug, row in meta.iterrows():
            toks = []
            for fld, w in cfg.field_weights.items():
                for word in norm(row[fld]).split():
                    if (
                        len(word) < 3
                        or word.isdigit()
                        or is_year(word)
                        or word in STOPWORDS
                    ):
                        continue
                    toks.append((word, w, fld))
                    self.token_to_slugs[word].add(slug)
                    self.field_w[word] = max(self.field_w.get(word, 0.0), w)
            self.slug_tokens[slug] = toks
        n = len(self.slug_tokens)
        self.idf = {
            w: math.log(1 + n / max(1, len(s))) for w, s in self.token_to_slugs.items()
        }
        self.vocab_skeleton = defaultdict(set)
        for w in self.idf:
            self.vocab_skeleton[skeleton(w)].add(w)
        self._canon_cache = {}

    def canon(self, token, max_ed=1):
        hit = self._canon_cache.get(token)
        if hit is not None:
            return hit
        forms = set()
        if token in self.idf:
            forms.add(token)
        sk = skeleton(token)
        forms.update(self.vocab_skeleton.get(sk, ()))
        if len(sk) >= 4:
            for key, vals in self.vocab_skeleton.items():
                if (
                    abs(len(key) - len(sk)) <= max_ed
                    and Levenshtein.distance(sk, key) <= max_ed
                ):
                    forms.update(vals)
        for v in translit_variants(token):
            if v in self.idf:
                forms.add(v)
                forms.update(self.vocab_skeleton.get(skeleton(v), ()))
        self._canon_cache[token] = forms
        return forms

    def query_forms(self, ocr_toks):
        """canon/транслит - один раз на запрос, а не на пару (запрос, slug)."""
        return [(ot, oc, self.canon(ot), translit_variants(ot)) for ot, oc in ocr_toks]

    def score(self, slug, forms):
        total = 0.0
        sl_toks = self.slug_tokens.get(slug, ())
        for ot, oc, cf, ot_var in forms:
            if cf:
                best = 0.0
                for ftok in cf:
                    if (
                        ftok in self.token_to_slugs
                        and slug in self.token_to_slugs[ftok]
                    ):
                        best = max(
                            best, self.idf.get(ftok, 0.0) * self.field_w.get(ftok, 1.0)
                        )
                if best > 0:
                    total += best * oc
                    continue
            best = 0.0
            for ct, cw, _fld in sl_toks:
                if abs(len(ct) - len(ot)) > 2:  # префильтр: режем 90% вызовов fuzzy
                    continue
                ct_var = translit_variants(ct)
                r = max(fz_ratio(a, b) for a in ot_var for b in ct_var) / 100.0
                if r >= self.cfg.fuzzy_ratio:
                    best = max(best, cw * self.idf.get(ct, 1.0) * r)
            total += best * oc
        return total
