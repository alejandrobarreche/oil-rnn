"""Evalúa un run ya entrenado sobre un split (test por defecto).

    make evaluate                       # último run (models/LATEST) sobre test
    make evaluate RUN=<run_id> SPLIT=val

Usa la config guardada en runs/<run_id>/config.yaml, no la actual, para que la evaluación
corresponda exactamente al modelo entrenado.
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, datetime

from .config import load_config, require
from .data import data_fingerprint, load_split
from .features import REQUIRED, Preprocessor
from .metrics import compute_metrics, predictions_frame, save_eval_plots
from .model import Predictor
from .paths import latest_run_id, relative, run_paths
from .run import Run

log = logging.getLogger(__name__.split(".")[0])


def run_evaluation(argv: list[str] | None = None) -> dict:
    """Evalúa y devuelve las métricas (útil desde notebooks o scripts)."""
    parser = argparse.ArgumentParser(description="Evalúa un run entrenado")
    parser.add_argument("--run", default=None, help="run_id (por defecto el último)")
    parser.add_argument("--split", default="test", choices=["train", "val", "test"])
    args = parser.parse_args(argv)

    run_id = args.run or latest_run_id()
    cfg = load_config(run_paths(run_id)["run"] / "config.yaml")
    require(cfg, *REQUIRED)
    if args.split != "test":
        log.warning(
            "make train entrena con train + val: evaluar en '%s' es dentro de la muestra. "
            "Las métricas de validación son las de make cv.",
            args.split,
        )
    history = Preprocessor(cfg).history
    df = load_split(args.split, context=history)

    with Run(cfg, run_id=run_id) as run:
        trained_on = run.meta.get("data", {}).get("splits", {}).get(args.split)
        current = data_fingerprint().get("splits", {}).get(args.split)
        if trained_on and current and trained_on != current:
            log.warning(
                "Los datos de '%s' han cambiado desde que se entrenó este run "
                "(data/splits.json distinto).",
                args.split,
            )

        out = Predictor.load(run.model_dir).predict_frame(df)
        metrics = compute_metrics(cfg["task"], out, prefix=f"{args.split}_")
        run.log_metrics(metrics)
        predictions_frame(out).to_csv(
            run.artifacts_dir / f"predictions_{args.split}.csv", index=False
        )
        save_eval_plots(cfg["task"], out, run.artifacts_dir, args.split)

        result = {
            "split": args.split,
            "evaluated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "data": current,
            "metrics": metrics,
        }
        (run.dir / f"eval_{args.split}.json").write_text(json.dumps(result, indent=2), "utf-8")
        run.meta.setdefault("evaluations", {})[args.split] = result

    print(f"\nRun: {run_id}  ·  split: {args.split}")
    for k, v in metrics.items():
        print(f"  {k:<22} {v:.4f}")
    print(f"  predicciones y gráficas → {relative(run.artifacts_dir)}")
    return metrics


def main() -> None:
    run_evaluation()


if __name__ == "__main__":
    main()
