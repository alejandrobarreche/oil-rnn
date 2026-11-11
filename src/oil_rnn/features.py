"""Preprocesado: convierte un DataFrame en los arrays que entran al modelo.

Se ajusta solo con train y se guarda en models/<run_id>/preprocessor.joblib, así la inferencia
aplica exactamente la misma transformación.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from .config import require
from .data import CONTEXT_COLUMN, feature_columns

# Decisiones que necesita el preprocesado; si alguna sigue PENDIENTE, el entrenamiento se para.
REQUIRED = ("data.target", "data.features", "data.window", "data.horizon", "data.target_mode")


class Preprocessor:
    """Serie temporal → ventanas.

    Para predecir el valor de la fila t se usan las `window` filas que terminan en t - horizon.
    Entradas y target se estandarizan con la media y la desviación de train.

    data.inputs.transform (cómo entra cada feature en la red):
      level    el valor tal cual.
      returns  el cambio diario, estacionario a diferencia del nivel: log(x[t] / x[t-1]) por
               defecto, x[t] - x[t-1] en las columnas de `diff` (admiten valores <= 0) y
               log(1+x[t]) - log(1+x[t-1]) en las de `log1p_diff` (volúmenes con ceros).
      `floor` fija un mínimo por columna antes de transformar (WTI negativo del 20/04/2020).
      `volatility: v` añade la desviación típica móvil de v días del rendimiento del target.
      `clip: c` recorta las entradas estandarizadas a ±c (límite fijo, no ajustado con datos).
      Las primeras `warmup` filas no tienen entrada completa y no forman parte de ninguna ventana.

    target_mode:
      level   la red predice el valor (ej. el precio).
      change  la red predice el cambio respecto al último valor conocido y el valor se reconstruye
              sumándolo. En series no estacionarias (precios) suele generalizar mucho mejor,
              porque test cae a menudo fuera del rango de valores visto en train.
      log_return  la red predice log(valor / último valor conocido): un cambio relativo,
              comparable entre épocas con niveles de precio distintos. Exige un target positivo.
    """

    def __init__(self, cfg: dict):
        require(cfg, *REQUIRED)
        dcfg = cfg["data"]
        self.target: str = dcfg["target"]
        self.time_column: str = dcfg["time_column"]
        self.window: int = int(dcfg["window"])
        self.horizon: int = int(dcfg["horizon"])
        self.target_mode: str = dcfg["target_mode"]
        if self.target_mode not in ("level", "change", "log_return"):
            raise ValueError(
                f"data.target_mode debe ser level, change o log_return, no {self.target_mode}"
            )
        self.requested_features = dcfg["features"]
        self.features: list[str] = []
        self.classes = None

        icfg = dcfg.get("inputs") or {}
        self.input_transform: str = icfg.get("transform", "level")
        if self.input_transform not in ("level", "returns"):
            raise ValueError(
                f"data.inputs.transform debe ser level o returns, no {self.input_transform}"
            )
        self.diff_columns: list[str] = list(icfg.get("diff") or [])
        self.log1p_columns: list[str] = list(icfg.get("log1p_diff") or [])
        self.floor: dict[str, float] = {k: float(v) for k, v in (icfg.get("floor") or {}).items()}
        vol = icfg.get("volatility")
        self.volatility: int | None = int(vol) if vol else None
        clip = icfg.get("clip")
        self.clip: float | None = float(clip) if clip else None
        self.transforms: list[str] = []  # uno por feature, se fija en fit
        self.inputs: list[str] = []  # nombres de las entradas de la red: features + derivadas

    @property
    def warmup(self) -> int:
        """Filas iniciales sin entrada completa (el cambio diario necesita la fila anterior)."""
        if self.volatility:
            return self.volatility
        return 1 if self.input_transform == "returns" else 0

    @property
    def history(self) -> int:
        """Filas del split anterior que necesita la primera ventana de val o test."""
        return self.window + self.horizon - 1 + self.warmup

    def fit(self, df: pd.DataFrame) -> Preprocessor:
        self.features = feature_columns(df, self.requested_features, self.time_column)
        if self.target not in df.select_dtypes(include="number").columns:
            raise TypeError(f"El target '{self.target}' debe ser numérico en una serie temporal")
        self._set_transforms()
        x = self._inputs(df[self.features].to_numpy(np.float64))[self.warmup :]
        self._check_finite(x)
        self.x_mean, self.x_scale = x.mean(axis=0), _safe_scale(x.std(axis=0))
        y = self._model_target(df[self.target].to_numpy(np.float64))
        y = y[~np.isnan(y)]
        self.y_mean, self.y_scale = float(y.mean()), float(_safe_scale(np.array([y.std()]))[0])
        return self

    def _model_target(self, level: np.ndarray) -> np.ndarray:
        """Lo que aprende la red en cada fila: el valor o su cambio a `horizon` pasos."""
        if self.target_mode == "level":
            return level
        if self.target_mode == "log_return" and np.nanmin(level) <= 0:
            raise ValueError(f"target_mode=log_return exige '{self.target}' > 0 en todas las filas")
        out = np.full_like(level, np.nan)
        now, before = level[self.horizon :], level[: -self.horizon]
        out[self.horizon :] = now - before if self.target_mode == "change" else np.log(now / before)
        return out

    def _set_transforms(self) -> None:
        if self.input_transform == "level":
            self.transforms = ["level"] * len(self.features)
        else:
            listed = set(self.diff_columns) | set(self.log1p_columns) | set(self.floor)
            unknown = sorted(listed - set(self.features))
            if unknown:
                raise ValueError(f"data.inputs nombra columnas que no son features: {unknown}")
            kind = {f: "diff" for f in self.diff_columns}
            kind.update({f: "log1p_diff" for f in self.log1p_columns})
            self.transforms = [kind.get(f, "log_diff") for f in self.features]
        self.inputs = list(self.features)
        if self.volatility:
            if self.target not in self.features:
                raise ValueError("data.inputs.volatility exige el target entre las features")
            self.inputs.append(f"{self.target}_vol{self.volatility}")

    def _inputs(self, raw: np.ndarray) -> np.ndarray:
        """Filas en bruto (n, features) → entradas sin escalar (n, inputs).
        La fila t solo usa filas <= t; las primeras `warmup` quedan incompletas (NaN)."""
        x = np.array(raw, dtype=np.float64)
        for j, f in enumerate(self.features):
            if f in self.floor:
                x[:, j] = np.maximum(x[:, j], self.floor[f])
        out = np.full_like(x, np.nan)
        with np.errstate(divide="ignore", invalid="ignore"):
            for j, kind in enumerate(self.transforms):
                col = x[:, j]
                if kind == "level":
                    out[:, j] = col
                elif kind == "diff":
                    out[1:, j] = np.diff(col)
                elif kind == "log1p_diff":
                    out[1:, j] = np.diff(np.log1p(col))
                else:
                    out[1:, j] = np.diff(np.log(col))
            if self.volatility:
                price = x[:, self.features.index(self.target)]
                ret = np.full(len(price), np.nan)
                ret[1:] = np.diff(np.log(price))
                vol = pd.Series(ret).rolling(self.volatility).std().to_numpy()
                out = np.column_stack([out, vol])
        return out

    def _check_finite(self, x: np.ndarray) -> None:
        bad = ~np.isfinite(x).all(axis=0)
        if bad.any():
            names = [n for n, b in zip(self.inputs, bad, strict=True) if b]
            raise ValueError(
                f"Valores vacíos o no finitos en las entradas {names}. Huecos al inicio de la "
                "serie: recorta el comienzo de los datos o quita la columna. Valores <= 0 con "
                "log: usa data.inputs.floor, diff o log1p_diff para esa columna."
            )

    @property
    def n_features(self) -> int:
        """Número de entradas de la red (features transformadas + derivadas)."""
        return len(self.inputs)

    def scale_features(self, values: np.ndarray) -> np.ndarray:
        """Estandariza con train y, si hay data.inputs.clip, recorta a ±clip desviaciones."""
        z = (values - self.x_mean) / self.x_scale
        clip = getattr(self, "clip", None)  # preprocesados guardados antes de existir clip
        if clip:
            z = np.clip(z, -clip, clip)
        return z.astype(np.float32)

    def windows(self, df: pd.DataFrame) -> dict:
        """Ventanas de entrada y, para cada una, el instante que se predice."""
        first = self.warmup + self.window - 1 + self.horizon  # primer índice con historia
        if len(df) <= first:
            raise ValueError(
                f"Hacen falta más de {first} filas para window={self.window}, "
                f"horizon={self.horizon} y warmup={self.warmup}"
            )
        x = self._inputs(df[self.features].to_numpy(np.float64))[self.warmup :]
        self._check_finite(x)
        x = self.scale_features(x)
        y = df[self.target].to_numpy(np.float64) if self.target in df else None
        is_context = (
            df[CONTEXT_COLUMN].to_numpy(bool) if CONTEXT_COLUMN in df else np.zeros(len(df), bool)
        )

        # sliding_window_view → (n_ventanas, F, W); se pasa a (n_ventanas, W, F).
        # La ventana k empieza en la fila warmup + k y termina en warmup + k + window - 1.
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
        elif self.target_mode != "level":
            raise ValueError(
                f"target_mode={self.target_mode} necesita la columna '{self.target}' en los datos"
            )
        return out

    def window_from_rows(self, rows: np.ndarray) -> np.ndarray:
        """Últimas window + warmup filas en bruto (orden de self.features) → una ventana
        escalada (window, inputs). Es lo que replica web/src/model.ts."""
        need = self.window + self.warmup
        if len(rows) < need:
            raise ValueError(f"Hacen falta al menos {need} filas; hay {len(rows)}")
        x = self._inputs(np.asarray(rows, np.float64)[-need:])[self.warmup :]
        self._check_finite(x)
        return self.scale_features(x)

    def inverse_target(self, y_scaled: np.ndarray, last_value: np.ndarray) -> np.ndarray:
        """Salida de la red → valor real. last_value es el último valor conocido (y_last).
        Con varios cuantiles, y_scaled es (n, q); la transformación es creciente, así que
        cada cuantil del rendimiento da el mismo cuantil del precio."""
        y = np.asarray(y_scaled, np.float64) * self.y_scale + self.y_mean
        last_value = np.asarray(last_value, np.float64)
        if y.ndim == 2:
            last_value = last_value[:, None]
        if self.target_mode == "change":
            return last_value + y
        if self.target_mode == "log_return":
            return last_value * np.exp(y)
        return y


def _safe_scale(std: np.ndarray) -> np.ndarray:
    return np.where(std > 0, std, 1.0)
