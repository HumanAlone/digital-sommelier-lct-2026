import copy
import json

import faiss
import torch
import torch.nn.functional as F
from config import CFG, PATHS
from transformers import AutoModel, AutoProcessor

if CFG.torch_threads:
    torch.set_num_threads(CFG.torch_threads)


def load_siglip_pair():
    base = AutoModel.from_pretrained(CFG.model_name).float().eval()
    try:
        sd = torch.load(PATHS.siglip_ft_pt, map_location="cpu")
    except FileNotFoundError as e:
        raise FileNotFoundError("нет дообученных весов: %s" % PATHS.siglip_ft_pt) from e
    ft = copy.deepcopy(base)  # одна инициализация с хаба на обе модели
    ft.load_state_dict(sd)
    proc = AutoProcessor.from_pretrained(CFG.model_name)
    return proc, base, ft


def _vec(model, x):
    out = model.get_image_features(pixel_values=x, return_dict=True)
    v = out.pooler_output if hasattr(out, "pooler_output") else out
    return F.normalize(v.float(), dim=-1)


@torch.no_grad()
def embed_pair(proc, base, ft, img):
    """Один препроцессинг - два энкодера (ступени recall и rerank)."""
    x = proc(images=img.convert("RGB"), return_tensors="pt")["pixel_values"]
    return (_vec(base, x).numpy().flatten(), _vec(ft, x).numpy().flatten())


def load_indexes():
    idx_b = faiss.read_index(str(PATHS.recall_idx))
    idx_f = faiss.read_index(str(PATHS.rerank_idx))
    with open(PATHS.recall_slugs, encoding="utf-8") as f:
        slugs_b = json.load(f)
    with open(PATHS.rerank_slugs, encoding="utf-8") as f:
        slugs_f = json.load(f)
    return idx_b, slugs_b, idx_f, slugs_f


def search_two(idx_b, slugs_b, idx_f, slugs_f, vb, vf, k):
    d_b, i_b = idx_b.search(vb[None, :].astype("float32"), k)
    d_f, i_f = idx_f.search(vf[None, :].astype("float32"), k)
    rank_b = [slugs_b[i] for i in i_b[0] if i >= 0]
    rank_f = [slugs_f[i] for i in i_f[0] if i >= 0]
    cos_b = {slugs_b[i]: float(d) for d, i in zip(d_b[0], i_b[0]) if i >= 0}
    cos_f = {slugs_f[i]: float(d) for d, i in zip(d_f[0], i_f[0]) if i >= 0}
    return rank_b, rank_f, cos_b, cos_f
