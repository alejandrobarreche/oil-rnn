"""Configuración de MLflow.

Prioridad de destino:
  1. variable de entorno MLFLOW_TRACKING_URI (o en .env)
  2. mlflow.tracking_uri en la config
  3. "local" → base de datos SQLite en runs/mlflow.db y artefactos en runs/mlflow_artifacts/
"""

from __future__ import annotations

import os

from .paths import RUNS_DIR

LOCAL_DB = RUNS_DIR / "mlflow.db"
LOCAL_ARTIFACTS = RUNS_DIR / "mlflow_artifacts"


def tracking_uri(cfg: dict | None = None) -> str:
    uri = os.getenv("MLFLOW_TRACKING_URI") or (cfg or {}).get("mlflow", {}).get("tracking_uri")
    if not uri or uri == "local":
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{LOCAL_DB.resolve().as_posix()}"
    return uri


def setup_mlflow(cfg: dict):
    import mlflow

    uri = tracking_uri(cfg)
    mlflow.set_tracking_uri(uri)
    name = cfg.get("mlflow", {}).get("experiment", "")
    if mlflow.get_experiment_by_name(name) is None:
        location = LOCAL_ARTIFACTS.resolve().as_uri() if uri.startswith("sqlite") else None
        mlflow.create_experiment(name, artifact_location=location)
    mlflow.set_experiment(name)
    return mlflow
