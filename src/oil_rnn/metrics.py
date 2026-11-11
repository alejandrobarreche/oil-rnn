"""Métricas y gráficas de evaluación. Reciben la salida de Predictor.predict_frame()."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # sin ventana: funciona igual en servidores sin pantalla
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn import metrics as skm  # noqa: E402


def _regression(y_true, y_pred) -> dict[str, float]:
    return {
        "mse": skm.mean_squared_error(y_true, y_pred),
        "rmse": skm.root_mean_squared_error(y_true, y_pred),
        "mae": skm.mean_absolute_error(y_true, y_pred),
        "r2": skm.r2_score(y_true, y_pred),
    }


def _interval(y_true, q_pred, quantiles) -> dict[str, float]:
    """Cobertura (fracción de valores reales dentro de [menor, mayor cuantil]), anchura media
    del intervalo y pérdida pinball media sobre todos los cuantiles, en unidades del target."""
    lo, hi = q_pred[:, 0], q_pred[:, -1]
    q = np.asarray(quantiles, dtype=np.float64)
    e = np.asarray(y_true, np.float64)[:, None] - q_pred
    return {
        "coverage": np.mean((lo <= y_true) & (y_true <= hi)),
        "interval_width": np.mean(hi - lo),
        "pinball": np.mean(np.maximum(q * e, (q - 1) * e)),
    }


def compute_metrics(task: str, out: dict, prefix: str = "") -> dict[str, float]:
    """Métricas del modelo y de la referencia trivial (y_baseline): clase mayoritaria de train,
    media de train o, en series temporales, persistencia (el último valor conocido).
    Con cuantiles añade cobertura, anchura y pinball, y las de su referencia (y_ref_quantiles:
    cuantiles históricos de train). skill_vs_baseline y pinball_skill <= 0: no mejora."""
    y_true, y_pred = out["y_true"], out["y_pred"]
    base = out.get("y_baseline")
    if task == "classification":
        m = {
            "accuracy": skm.accuracy_score(y_true, y_pred),
            "f1_macro": skm.f1_score(y_true, y_pred, average="macro"),
            "precision_macro": skm.precision_score(
                y_true, y_pred, average="macro", zero_division=0
            ),
            "recall_macro": skm.recall_score(y_true, y_pred, average="macro", zero_division=0),
        }
        proba = out.get("y_proba")
        if proba is not None and proba.shape[1] == 2 and len(np.unique(y_true)) == 2:
            m["roc_auc"] = skm.roc_auc_score(y_true, proba[:, 1])
        if base is not None:
            m["baseline_accuracy"] = skm.accuracy_score(y_true, base)
            m["baseline_f1_macro"] = skm.f1_score(y_true, base, average="macro")
    else:
        m = _regression(y_true, y_pred)
        if base is not None:
            # skill <= 0: el modelo no mejora a la referencia trivial
            ref = _regression(y_true, base)
            m |= {
                "baseline_mse": ref["mse"],
                "baseline_rmse": ref["rmse"],
                "baseline_mae": ref["mae"],
                "skill_vs_baseline": 1 - m["rmse"] / ref["rmse"],
            }
            # Dirección respecto al último valor conocido. La persistencia no predice dirección:
            # su referencia es predecir siempre la dirección más frecuente en train.
            m["direction_accuracy"] = np.mean((y_pred > base) == (y_true > base))
            if out.get("up_share") is not None:
                up = out["up_share"] >= 0.5
                m["baseline_direction_accuracy"] = np.mean((y_true > base) == up)
        if "y_quantiles" in out:
            m |= _interval(y_true, out["y_quantiles"], out["quantiles"])
            m["coverage_nominal"] = out["quantiles"][-1] - out["quantiles"][0]
            if "y_ref_quantiles" in out:
                ref = _interval(y_true, out["y_ref_quantiles"], out["quantiles"])
                m |= {f"baseline_{k}": v for k, v in ref.items()}
                m["pinball_skill"] = 1 - m["pinball"] / ref["pinball"]
    return {f"{prefix}{k}": float(v) for k, v in m.items()}


def save_eval_plots(task: str, out: dict, out_dir: Path, split: str) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    y_true, y_pred = out["y_true"], out["y_pred"]
    if task == "classification":
        fig, ax = plt.subplots(figsize=(6, 5))
        skm.ConfusionMatrixDisplay.from_predictions(y_true, y_pred, ax=ax, colorbar=False)
        ax.set_title(f"Matriz de confusión ({split})")
        path = out_dir / f"confusion_matrix_{split}.png"
    elif "time" in out:
        fig, ax = plt.subplots(figsize=(10, 4))
        x = out.get("time", np.arange(len(y_true)))
        if "y_lo" in out:
            ax.fill_between(x, out["y_lo"], out["y_hi"], alpha=0.25, label="Intervalo")
        ax.plot(x, y_true, linewidth=1, label="Real")
        ax.plot(x, y_pred, linewidth=1, label="Predicho")
        ax.set_title(f"Serie real y predicha ({split})")
        ax.legend()
        path = out_dir / f"series_{split}.png"
    else:
        fig, ax = plt.subplots(figsize=(6, 5))
        ax.scatter(y_true, y_pred, s=8, alpha=0.5)
        lo, hi = float(np.min(y_true)), float(np.max(y_true))
        ax.plot([lo, hi], [lo, hi], linestyle="--", linewidth=1)
        ax.set_xlabel("Real")
        ax.set_ylabel("Predicho")
        ax.set_title(f"Real frente a predicho ({split})")
        path = out_dir / f"pred_vs_true_{split}.png"
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    return [path]


def predictions_frame(out: dict):
    """Tabla con una fila por predicción (sin probabilidades)."""
    import pandas as pd

    keys = ("time", "y_true", "y_pred", "y_lo", "y_hi", "y_baseline")
    cols = {k: out[k] for k in keys if k in out}
    return pd.DataFrame(cols)
