"""Validación walk-forward: entrena un pliegue por bloque de train + val y registra un run.

make cv NAME=lstm-h5
make cv NAME=gru-h63 ARGS="--set model.cell=gru --set data.horizon=63"

Cada pliegue entrena con todo lo anterior a su bloque (purgado, con el último año para early
stopping) y predice el bloque, que solo se usa para medir. Test no interviene.

runs/<id>/metrics.json        fold<k>_<métrica> por pliegue y cv_<métrica> = media de pliegues
runs/<id>/conformal.json      corrección del intervalo para make train CALIB=<id>
artifacts/<id>/cv_predictions.csv   predicciones de cada bloque
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from . import conformal
from .config import add_config_args, load_config, require
from .data import fold_boundaries, load_train_val, segment, training_segments
from .features import REQUIRED, Preprocessor
from .metrics import compute_metrics, predictions_frame
from .model import Predictor, set_seed, train_model
from .paths import relative
from .run import Run


class _FoldRun:
    """Pasa las métricas de un pliegue al run con el prefijo fold<k>_."""

    def __init__(self, run: Run, k: int):
        self.run, self.prefix = run, f"fold{k}_"

    def log_metrics(self, metrics: dict[str, float], step: int | None = None) -> None:
        self.run.log_metrics({self.prefix + k: v for k, v in metrics.items()}, step=step)


def _calibrate(cfg: dict, frames: list[pd.DataFrame], run: Run) -> dict[str, float]:
    """Calibración conforme del intervalo con las predicciones de los bloques.

    Para medirla sin mirar el futuro, el pliegue k se corrige solo con los pliegues anteriores
    (el 1 no tiene con qué). La corrección que se guarda (conformal.json, la usa make train
    CALIB=<este run>) sale de los cuatro bloques, todos anteriores a test."""
    q = cfg["model"]["quantiles"]
    coverage = max(q) - min(q)
    mode, h = cfg["data"]["target_mode"], int(cfg["data"]["horizon"])

    def fit(parts: list[pd.DataFrame]) -> dict:
        d = pd.concat(parts)
        return conformal.fit(d["y_true"], d["y_lo"], d["y_hi"], mode, coverage, h)

    cov, width = [], []
    for k in range(1, len(frames)):
        conf, f = fit(frames[:k]), frames[k]
        lo, hi = conformal.apply(f["y_lo"], f["y_pred"], f["y_hi"], conf["correction"], mode)
        cov.append(float(np.mean((lo <= f["y_true"]) & (f["y_true"] <= hi))))
        width.append(float(np.mean(hi - lo)))
        run.log_metrics({f"fold{k + 1}_coverage_cqr": cov[-1], f"fold{k + 1}_width_cqr": width[-1]})

    final = fit(frames)
    (run.dir / "conformal.json").write_text(json.dumps(final, indent=2), encoding="utf-8")
    return {
        "cv_coverage_cqr": float(np.mean(cov)),  # media de los pliegues 2..k
        "cv_interval_width_cqr": float(np.mean(width)),
        "cv_conformal_correction": final["correction"],
    }


def run_cv(argv: list[str] | None = None) -> str:
    """Ejecuta los pliegues y devuelve el run_id."""
    parser = add_config_args(argparse.ArgumentParser(description="Validación walk-forward"))
    parser.add_argument("--name", default="cv", help="Nombre corto del run (va en el id)")
    args = parser.parse_args(argv)
    cfg = load_config(args.config, args.overrides)
    require(cfg, *REQUIRED, "cv.folds", "cv.block", "cv.holdout")
    set_seed(cfg.get("seed", 42))

    dev = load_train_val()
    h, history = int(cfg["data"]["horizon"]), Preprocessor(cfg).history
    cv = cfg["cv"]
    bounds = fold_boundaries(len(dev), int(cv["folds"]), int(cv["block"]))

    per_fold, frames = [], []
    with Run(cfg, name=args.name) as run:
        for k, (start, end) in enumerate(bounds, 1):
            fit_df, stop_df = training_segments(dev, start, h, int(cv["holdout"]), history)
            eval_df = segment(dev, start, end, history)
            fitted = train_model(cfg, fit_df, stop_df, _FoldRun(run, k))
            card = {"quantiles": fitted["quantiles"]}
            out = Predictor(fitted["net"], fitted["preprocessor"], card).predict_frame(eval_df)
            metrics = compute_metrics(cfg["task"], out)
            run.log_metrics({f"fold{k}_{m}": v for m, v in metrics.items()})
            per_fold.append(metrics)
            frames.append(predictions_frame(out).assign(fold=k))

        summary = {f"cv_{m}": float(np.mean([f[m] for f in per_fold])) for m in per_fold[0]}
        if fitted["quantiles"]:
            summary |= _calibrate(cfg, frames, run)
        run.log_metrics(summary)
        pd.concat(frames).to_csv(run.artifacts_dir / "cv_predictions.csv", index=False)

    print(f"\nRun: {run.id}  ·  {len(bounds)} pliegues")
    dates = pd.to_datetime(dev[cfg["data"]["time_column"]])
    for (start, end), m in zip(bounds, per_fold, strict=True):
        first, last = dates.iloc[start].date(), dates.iloc[end - 1].date()
        skill = m.get("skill_vs_baseline", float("nan"))
        print(f"  {first} → {last}  rmse={m.get('rmse', float('nan')):.4f}  skill={skill:+.4f}")
    for k, v in summary.items():
        print(f"  {k:<28} {v:.4f}")
    print(f"  registro → {relative(run.dir)}\n  predicciones → {relative(run.artifacts_dir)}")
    return run.id


def main() -> None:
    run_cv()


if __name__ == "__main__":
    main()
