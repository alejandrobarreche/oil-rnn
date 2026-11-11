"""Entrena el modelo final (train + val) y lo registra como un run. Se evalúa con make evaluate.
La comparación de modelos se hace con make cv (pliegues walk-forward).

make train NAME=baseline CALIB=<run de make cv con la misma configuración>
make train NAME=prueba ARGS="--set train.learning_rate=0.0005"
"""

from __future__ import annotations

import argparse
import json
import logging

from .config import add_config_args, load_config, require
from .data import load_train_val, training_segments
from .features import REQUIRED, Preprocessor
from .metrics import compute_metrics, save_eval_plots
from .model import Predictor, save_model, set_seed, train_model
from .paths import relative, run_paths
from .run import Run

log = logging.getLogger("oil_rnn")


SAME_AS_CV = ("task", "data_kind", "data", "model", "train", "cv")  # la semilla puede cambiar


def load_calibration(cv_run: str, cfg: dict) -> dict:
    """conformal.json de un run de make cv con la misma configuración que este entrenamiento."""
    folder = run_paths(cv_run)["run"]
    path = folder / "conformal.json"
    if not path.exists():
        raise FileNotFoundError(f"No existe {relative(path)}: ¿es un run de make cv con cuantiles?")
    cv_cfg = load_config(folder / "config.yaml")
    different = [k for k in SAME_AS_CV if cv_cfg.get(k) != cfg.get(k)]
    if different:
        raise ValueError(
            f"La configuración de {cv_run} no coincide con la de este entrenamiento en "
            f"{different}: la corrección del intervalo no sería válida para este modelo."
        )
    return {**json.loads(path.read_text(encoding="utf-8")), "source_run": cv_run}


def run_training(argv: list[str] | None = None) -> str:
    """Entrena y devuelve el run_id (útil desde notebooks o scripts)."""
    parser = add_config_args(argparse.ArgumentParser(description="Entrena un modelo"))
    parser.add_argument("--name", default="run", help="Nombre corto del run (va en el id)")
    parser.add_argument(
        "--calibration", default=None, help="run de make cv cuya corrección del intervalo se usa"
    )
    args = parser.parse_args(argv)
    cfg = load_config(args.config, args.overrides)
    require(cfg, *REQUIRED)
    set_seed(cfg.get("seed", 42))
    conf = load_calibration(args.calibration, cfg) if args.calibration else None
    if conf is None and cfg["model"].get("quantiles"):
        log.warning("Sin CALIB=<run de make cv>: el intervalo queda sin calibrar.")

    # Modelo final: train + val, con el último año (purgado) para early stopping. Es el mismo
    # procedimiento que cada pliegue de `make cv`, con test como bloque siguiente.
    dev = load_train_val()
    h = int(cfg["data"]["horizon"])
    history = Preprocessor(cfg).history
    fit_df, stop_df = training_segments(dev, len(dev), h, int(cfg["cv"]["holdout"]), history)

    with Run(cfg, name=args.name) as run:
        fitted = train_model(cfg, fit_df, stop_df, run)
        save_model({**fitted, "conformal": conf}, run.model_dir, cfg)

        # Se recarga desde disco: así se comprueba que lo guardado sirve para inferencia.
        # El tramo de parada decidió la época: sus métricas son optimistas, solo de control.
        # Las métricas de validación son las de `make cv`; las de test, las de `make evaluate`.
        out = Predictor.load(run.model_dir).predict_frame(stop_df)
        metrics = compute_metrics(cfg["task"], out, prefix="stop_")
        run.log_metrics(metrics)
        save_eval_plots(cfg["task"], out, run.artifacts_dir, "stop")

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
