"""Preprocesado: convierte un DataFrame en los arrays que entran al modelo.

Se ajusta solo con train y se guarda en models/<run_id>/preprocessor.joblib, así la inferencia
aplica exactamente la misma transformación.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from .config import require
from .data import CONTEXT_COLUMN

# Decisiones que necesita el preprocesado; si alguna sigue PENDIENTE, el entrenamiento se para.
REQUIRED = ("data.target", "data.features", "data.window", "data.horizon", "data.target_mode")


class Preprocessor:
    """Serie temporal → ventanas.

    Para predecir el valor de la fila t se usan las `window` filas que terminan en t - horizon.
    Features y target se estandarizan con la media y la desviación de train.

    target_mode:
      level   la red predice el valor (ej. el precio).
      change  la red predice el cambio respecto al último valor conocido y el valor se reconstruye
              sumándolo. En series no estacionarias (precios) suele generalizar mucho mejor,
              porque test cae a menudo fuera del rango de valores visto en train.
    """

    def __init__(self, cfg: dict):
        require(cfg, *REQUIRED)
        dcfg = cfg["data"]
        self.target: str = dcfg["target"]
        self.time_column: str = dcfg["time_column"]
        self.window: int = int(dcfg["window"])
        self.horizon: int = int(dcfg["horizon"])
        self.target_mode: str = dcfg["target_mode"]
        if self.target_mode not in ("level", "change"):
            raise ValueError(f"data.target_mode debe ser level o change, no {self.target_mode}")
        self.requested_features = dcfg["features"]
        self.features: list[str] = []
        self.classes = None

    def fit(self, df: pd.DataFrame) -> Preprocessor:
        if self.requested_features == "all":
            excluded = {self.time_column, CONTEXT_COLUMN}
            numeric = df.select_dtypes(include="number").columns
            self.features = [c for c in numeric if c not in excluded]
        else:
            self.features = list(self.requested_features)
        if self.target not in df.select_dtypes(include="number").columns:
            raise TypeError(f"El target '{self.target}' debe ser numérico en una serie temporal")
        x = df[self.features].to_numpy(np.float64)
        self.x_mean, self.x_scale = x.mean(axis=0), _safe_scale(x.std(axis=0))
        y = self._model_target(df[self.target].to_numpy(np.float64))
        y = y[~np.isnan(y)]
        self.y_mean, self.y_scale = float(y.mean()), float(_safe_scale(np.array([y.std()]))[0])
        return self

    def _model_target(self, level: np.ndarray) -> np.ndarray:
        """Lo que aprende la red en cada fila: el valor o su cambio a `horizon` pasos."""
        if self.target_mode == "change":
            out = np.full_like(level, np.nan)
            out[self.horizon :] = level[self.horizon :] - level[: -self.horizon]
            return out
        return level

    @property
    def n_features(self) -> int:
        return len(self.features)

    @property
    def n_outputs(self) -> int:
        return 1

    def scale_features(self, values: np.ndarray) -> np.ndarray:
        return ((values - self.x_mean) / self.x_scale).astype(np.float32)

    def windows(self, df: pd.DataFrame) -> dict:
        """Ventanas de entrada y, para cada una, el instante que se predice."""
        x = self.scale_features(df[self.features].to_numpy(np.float64))
        if np.isnan(x).any():
            bad_columns = np.isnan(x).any(axis=0)
            empty = [f for f, bad in zip(self.features, bad_columns, strict=True) if bad]
            raise ValueError(
                f"Valores vacíos en las features {empty} (make prepare dice en qué split). "
                "Los del inicio de la serie no se pueden rellenar con valores pasados: quita "
                "esas columnas de data.features o recorta el comienzo de los datos."
            )
        y = df[self.target].to_numpy(np.float64) if self.target in df else None
        is_context = (
            df[CONTEXT_COLUMN].to_numpy(bool) if CONTEXT_COLUMN in df else np.zeros(len(df), bool)
        )

        first = self.window - 1 + self.horizon  # primer índice con historia suficiente
        if len(df) <= first:
            raise ValueError(
                f"Hacen falta más de {first} filas para window={self.window} "
                f"y horizon={self.horizon}"
            )
        # sliding_window_view → (n_ventanas, F, W); se pasa a (n_ventanas, W, F)
        all_windows = sliding_window_view(x, self.window, axis=0).transpose(0, 2, 1)
        targets = np.arange(first, len(df))
        keep = ~is_context[targets]
        targets = targets[keep]
        out = {"X": np.ascontiguousarray(all_windows[targets - first]), "row": targets}
        if self.time_column in df:
            out["time"] = df[self.time_column].to_numpy()[targets]
        if y is not None:
            out["y_true"] = y[targets]
            out["y_last"] = y[targets - self.horizon]  # último valor conocido = referencia
            model_y = self._model_target(y)[targets]
            out["y"] = ((model_y - self.y_mean) / self.y_scale).astype(np.float32)
        elif self.target_mode == "change":
            raise ValueError(f"target_mode=change necesita la columna '{self.target}' en los datos")
        return out

    def inverse_target(self, y_scaled: np.ndarray, last_value: np.ndarray) -> np.ndarray:
        """Salida de la red → valor real. last_value es el último valor conocido (y_last)."""
        y = np.asarray(y_scaled, np.float64) * self.y_scale + self.y_mean
        return last_value + y if self.target_mode == "change" else y


def _safe_scale(std: np.ndarray) -> np.ndarray:
    return np.where(std > 0, std, 1.0)
