"""Calibración conforme del intervalo (regresión cuantílica conformalizada, CQR).

La red da los cuantiles 0,1 y 0,9, pero nada garantiza que el intervalo cubra el 80 % fuera de
train. Con predicciones que la red no ha visto (los bloques de make cv) se mide cuánto se queda
corto o se pasa cada intervalo (puntuación de conformidad) y se ensancha o estrecha en la
cantidad que habría dado la cobertura pedida en esos bloques.

Con target_mode log_return la corrección es relativa (en log): un intervalo de 60–80 $ y otro
de 100–130 $ se corrigen en la misma proporción, no en los mismos dólares.

Supuesto: las puntuaciones son intercambiables. Con rendimientos a h días solapados no lo son
del todo; el número de puntuaciones independientes es aproximadamente n / h y se informa.
"""

from __future__ import annotations

import math

import numpy as np


def _log_scale(target_mode: str) -> bool:
    return target_mode == "log_return"


def scores(y_true, lo, hi, target_mode: str) -> np.ndarray:
    """Puntuación de conformidad: > 0 si el valor real queda fuera del intervalo (distancia al
    borde más cercano), < 0 si queda dentro (cuánto sobra)."""
    y, lo, hi = (np.asarray(v, np.float64) for v in (y_true, lo, hi))
    if _log_scale(target_mode):
        y, lo, hi = np.log(y), np.log(lo), np.log(hi)
    return np.maximum(lo - y, y - hi)


def correction(s: np.ndarray, coverage: float) -> float:
    """Cuantil ⌈(n+1)·coverage⌉/n de las puntuaciones: con puntuaciones intercambiables, el
    intervalo corregido cubre al menos `coverage` de los casos nuevos."""
    s = np.sort(np.asarray(s, np.float64))
    n = len(s)
    if n == 0:
        raise ValueError("Sin puntuaciones para calibrar")
    k = min(n, math.ceil((n + 1) * coverage))
    return float(s[k - 1])


def apply(lo, mid, hi, q: float, target_mode: str) -> tuple[np.ndarray, np.ndarray]:
    """Intervalo corregido: [lo, hi] ensanchado (q > 0) o estrechado (q < 0), sin pasar de la
    mediana para que los cuantiles no se crucen."""
    lo, mid, hi = (np.asarray(v, np.float64) for v in (lo, mid, hi))
    if _log_scale(target_mode):
        new_lo, new_hi = lo * math.exp(-q), hi * math.exp(q)
    else:
        new_lo, new_hi = lo - q, hi + q
    return np.minimum(new_lo, mid), np.maximum(new_hi, mid)


def calibrate_quantiles(pred: np.ndarray, quantiles: list[float], conf: dict) -> np.ndarray:
    """Cuantiles (n, q) → copia con el menor y el mayor corregidos según `conf`."""
    out = np.array(pred, dtype=np.float64)
    mid = out[:, quantiles.index(0.5)]
    out[:, 0], out[:, -1] = apply(out[:, 0], mid, out[:, -1], conf["correction"], conf["mode"])
    return out


def fit(y_true, lo, hi, target_mode: str, coverage: float, horizon: int) -> dict:
    """Corrección a partir de predicciones fuera de muestra; se guarda con el modelo."""
    s = scores(y_true, lo, hi, target_mode)
    return {
        "correction": correction(s, coverage),
        "coverage": coverage,
        "mode": target_mode,
        "n": len(s),
        "n_independent": len(s) // max(horizon, 1),  # aproximado: residuos a h días solapados
    }
