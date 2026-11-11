"""Run: une runs/<id>, models/<id> y artifacts/<id> con el run de MLflow.

    with Run(cfg, name="baseline") as run:
        ...
        run.log_metrics({"val_f1": 0.9})
        save_model(model, run.model_dir)
        fig.savefig(run.artifacts_dir / "curva.png")

El id incluye fecha, nombre y ordenador (ej. 20261111-142530_baseline_pc-gpu), así los runs
hechos en distintos ordenadores nunca chocan al juntarlos.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import re
import socket
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml

from .config import flatten
from .data import data_fingerprint
from .paths import LATEST_FILE, ROOT, relative, run_paths
from .tracking import setup_mlflow

log = logging.getLogger("oil_rnn")


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def machine_name() -> str:
    name = os.getenv("MACHINE_NAME") or socket.gethostname().split(".")[0]
    return re.sub(r"[^a-zA-Z0-9-]", "-", name).lower()[:20] or "pc"


def make_run_id(name: str) -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = re.sub(r"[^a-zA-Z0-9-]", "-", name).strip("-").lower() or "run"
    return f"{stamp}_{slug}_{machine_name()}"


def git_info() -> dict:
    def git(*args: str) -> str | None:
        res = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=5)
        return res.stdout.strip() if res.returncode == 0 else None

    try:
        commit = git("rev-parse", "--verify", "-q", "HEAD")
        status = git("status", "--porcelain")
        return {"commit": commit or None, "dirty": bool(status) if status is not None else None}
    except (OSError, subprocess.SubprocessError):
        return {"commit": None, "dirty": None}


class Run:
    def __init__(self, cfg: dict, name: str = "run", run_id: str | None = None):
        """Crea un run nuevo, o reabre uno existente si se pasa run_id (para evaluar)."""
        self.cfg = cfg
        self.resumed = run_id is not None
        self.id = run_id or make_run_id(name)
        p = run_paths(self.id)
        self.dir, self.model_dir, self.artifacts_dir = p["run"], p["model"], p["artifacts"]
        self.meta_path = self.dir / "meta.json"
        if self.resumed and not self.meta_path.exists():
            raise FileNotFoundError(f"No existe el run {self.id} en {relative(self.dir)}")
        self.meta: dict = (
            json.loads(self.meta_path.read_text("utf-8"))
            if self.resumed
            else {
                "run_id": self.id,
                "name": name,
                "status": "running",
                "started_at": _now(),
                "finished_at": None,
                "machine": {
                    "name": machine_name(),
                    "platform": platform.platform(),
                    "python": sys.version.split()[0],
                },
                "git": git_info(),
                "data": data_fingerprint(),
                "paths": {k: relative(v) for k, v in p.items()},
            }
        )
        self._log_handler: logging.Handler | None = None
        self._mlflow = None

    # ── ciclo de vida ──────────────────────────────────────
    def __enter__(self) -> Run:
        for d in (self.dir, self.model_dir, self.artifacts_dir):
            d.mkdir(parents=True, exist_ok=True)
        self._start_file_log()
        if not self.resumed:
            (self.dir / "config.yaml").write_text(
                yaml.safe_dump(self.cfg, sort_keys=False, allow_unicode=True), encoding="utf-8"
            )
        self._start_mlflow()
        self._save_meta()
        log.info("Run %s %s", self.id, "reabierto" if self.resumed else "iniciado")
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        ok = exc_type is None
        if not self.resumed:
            self.meta["status"] = "finished" if ok else "failed"
            self.meta["finished_at"] = _now()
            if ok:
                LATEST_FILE.parent.mkdir(parents=True, exist_ok=True)
                LATEST_FILE.write_text(self.id, encoding="utf-8")
        self._save_meta()
        self._end_mlflow(ok)
        log.info("Run %s %s", self.id, "terminado" if ok else "FALLIDO")
        if self._log_handler:
            logging.getLogger().removeHandler(self._log_handler)
            self._log_handler.close()

    # ── registro ───────────────────────────────────────────
    def log_metrics(self, metrics: dict[str, float], step: int | None = None) -> None:
        """Añade al histórico (metrics.jsonl) y actualiza el resumen (metrics.json)."""
        metrics = {k: float(v) for k, v in metrics.items()}
        with (self.dir / "metrics.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps({"step": step, "time": _now(), **metrics}) + "\n")
        summary_path = self.dir / "metrics.json"
        summary = json.loads(summary_path.read_text("utf-8")) if summary_path.exists() else {}
        summary.update(metrics)
        summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        if self._mlflow:
            self._mlflow.log_metrics(metrics, step=step)

    def log_artifact(self, path: Path) -> None:
        """Para archivos guardados fuera de artifacts/<id> que también quieras registrar."""
        if self._mlflow:
            self._mlflow.log_artifact(str(path))

    # ── internos ───────────────────────────────────────────
    def _save_meta(self) -> None:
        self.meta_path.write_text(json.dumps(self.meta, indent=2, ensure_ascii=False), "utf-8")

    def _start_file_log(self) -> None:
        root = logging.getLogger()
        if not root.handlers:
            logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        root.setLevel(logging.INFO)
        self._log_handler = logging.FileHandler(self.dir / "train.log", encoding="utf-8")
        self._log_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        root.addHandler(self._log_handler)

    def _start_mlflow(self) -> None:
        mlflow = setup_mlflow(self.cfg)
        mlflow_id = self.meta.get("mlflow", {}).get("run_id")
        if self.resumed and mlflow_id:
            mlflow.start_run(run_id=mlflow_id)
        else:
            mlflow.start_run(run_name=self.id)
            train_hash = self.meta["data"].get("splits", {}).get("train", "")
            mlflow.set_tags(
                {
                    "run_id": self.id,
                    "machine": machine_name(),
                    "git_commit": self.meta["git"]["commit"] or "",
                    "data_train_sha256": str(train_hash),
                }
            )
            params = {
                k: str(v)[:500] for k, v in flatten(self.cfg).items() if not k.startswith("mlflow.")
            }
            mlflow.log_params(params)
            active = mlflow.active_run()
            self.meta["mlflow"] = {
                "run_id": active.info.run_id,
                "experiment_id": active.info.experiment_id,
                "tracking_uri": mlflow.get_tracking_uri(),
            }
        self._mlflow = mlflow

    def _end_mlflow(self, ok: bool) -> None:
        if not self._mlflow:
            return
        mlflow = self._mlflow
        if any(self.artifacts_dir.iterdir()):
            mlflow.log_artifacts(str(self.artifacts_dir), artifact_path="artifacts")
        if (
            not self.resumed
            and self.cfg.get("mlflow", {}).get("log_models", True)
            and any(self.model_dir.iterdir())
        ):
            mlflow.log_artifacts(str(self.model_dir), artifact_path="model")
        for name in ("config.yaml", "meta.json", "train.log"):
            if (self.dir / name).exists():
                mlflow.log_artifact(str(self.dir / name), artifact_path="run")
        mlflow.end_run(status="FINISHED" if ok else "FAILED")
