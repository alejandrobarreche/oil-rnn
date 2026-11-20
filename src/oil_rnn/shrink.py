"""Contracción hacia la persistencia: cuánto creerse el rendimiento que predice la red.

La predicción contraída es w·r, con r el rendimiento predicho y w en [0, 1]: w = 0 es la
persistencia (el último precio conocido) y w = 1, la red sin tocar. Con pocos pronósticos
independientes (a 63 y 252 días) la red tiende a exagerar el tamaño de los movimientos; w
corrige esa escala sin cambiar la dirección.

w se elige en los bloques de make cv (anteriores a test) minimizando el error cuadrático del
precio, el del RMSE. Para medir lo que daría sin mirar el futuro, el bloque k se contrae con la
w elegida solo con los bloques anteriores (cv.py); la w que se guarda (shrink.json, la aplica
make train CALIB=<run de cv>) sale de todos los bloques.

Con cuantiles, todos se desplazan lo mismo que la mediana (en log con log_return), así que el
ancho del intervalo no cambia; la calibración conforme se ajusta después, sobre lo contraído.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

PRICE_COLUMNS = ("y_pred", "y_lo", "y_hi")


def apply(frame: pd.DataFrame, w: float, target_mode: str) -> pd.DataFrame:
    """Copia de las predicciones (columnas de predictions_frame) contraídas con el factor w.
    Es la misma operación que ForecastNet.shrink, en unidades del precio."""
    out = frame.copy()
    pred, last = frame["y_pred"].to_numpy(np.float64), frame["y_baseline"].to_numpy(np.float64)
    cols = [c for c in PRICE_COLUMNS if c in frame]
    if target_mode == "log_return":
        factor = (pred / last) ** (w - 1.0)
        for c in cols:
            out[c] = frame[c].to_numpy(np.float64) * factor
    elif target_mode == "change":
        shift = (1.0 - w) * (pred - last)
        for c in cols:
            out[c] = frame[c].to_numpy(np.float64) - shift
    else:
        raise ValueError("La contracción exige target_mode log_return o change")
    return out


def mse(frame: pd.DataFrame) -> float:
    return float(np.mean((frame["y_true"] - frame["y_pred"]) ** 2))


def choose(frames: list[pd.DataFrame], grid: list[float], target_mode: str) -> float:
    """w de la rejilla con menos error cuadrático en el conjunto de bloques. En caso de empate,
    la menor (la más cercana a la persistencia)."""
    if not frames:
        raise ValueError("Sin predicciones para elegir la contracción")
    data = pd.concat(frames, ignore_index=True)
    errors = [mse(apply(data, float(w), target_mode)) for w in sorted(grid)]
    return float(sorted(grid)[int(np.argmin(errors))])
