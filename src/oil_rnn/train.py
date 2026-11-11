"""Entrena un modelo y lo registra como un run.

make train NAME=baseline
make train NAME=prueba ARGS="--set train.learning_rate=0.0005"
"""

from __future__ import annotations

import argparse

from .config import add_config_args, load_config, require
from .data import load_split
from .features import REQUIRED, Preprocessor
from .metrics import compute_metrics, save_eval_plots
from .model import Predictor, save_model, set_seed, train_model
from .paths import relative
from .run import Run


def run_training(argv: list[str] | None = None) -> str:
    """Entrena y devuelve el run_id (útil desde notebooks o scripts)."""
    parser = add_config_args(argparse.ArgumentParser(description="Entrena un modelo"))
    parser.add_argument("--name", default="run", help="Nombre corto del run (va en el id)")
    args = parser.parse_args(argv)
    cfg = load_config(args.config, args.overrides)
    require(cfg, *REQUIRED)
    set_seed(cfg.get("seed", 42))

    train_df = load_split("train")
    history = Preprocessor(cfg).history
    val_df = load_split("val", context=history)  # las primeras ventanas usan el final de train

    with Run(cfg, name=args.name) as run:
        fitted = train_model(cfg, train_df, val_df, run)
        save_model(fitted, run.model_dir, cfg)

        # Se recarga desde disco: así se comprueba que lo guardado sirve para inferencia.
        out = Predictor.load(run.model_dir).predict_frame(val_df)
        metrics = compute_metrics(cfg["task"], out, prefix="val_")
        run.log_metrics(metrics)
        save_eval_plots(cfg["task"], out, run.artifacts_dir, "val")

    print(f"\nRun: {run.id}")
    for k, v in metrics.items():
        print(f"  {k:<22} {v:.4f}")
    print(
        f"  registro   → {relative(run.dir)}\n  modelo     → {relative(run.model_dir)}"
        f"\n  artefactos → {relative(run.artifacts_dir)}"
    )
    return run.id


def main() -> None:
    run_training()


if __name__ == "__main__":
    main()
