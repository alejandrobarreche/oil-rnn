"""Rutas del proyecto. Es el único sitio donde se definen: el resto del código las importa de aquí.

Estructura:
    data/raw        datos originales, sin tocar (`make data` + _source.json con su origen)
    data/interim    pasos intermedios de limpieza
    data/external   datos de terceros
    data/train      split de entrenamiento   ┐
    data/val        split de validación      ├ generados por `make prepare`
    data/test       split de test            ┘
    data/splits.json  manifiesto con origen, semilla y hashes de los splits

    runs/<run_id>       registro del run: config, meta, métricas, log
    models/<run_id>     todo lo necesario para inferencia
    artifacts/<run_id>  salidas para humanos: gráficas, predicciones, informes

El mismo <run_id> une las tres carpetas.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def _find_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "pyproject.toml").exists():
            return parent
    return Path.cwd()


ROOT = _find_root()
load_dotenv(ROOT / ".env")

CONFIGS_DIR = ROOT / "configs"
DEFAULT_CONFIG = CONFIGS_DIR / "config.yaml"

DATA_DIR = Path(os.getenv("DATA_DIR") or ROOT / "data").expanduser().resolve()
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
EXTERNAL_DIR = DATA_DIR / "external"
TRAIN_DIR = DATA_DIR / "train"
VAL_DIR = DATA_DIR / "val"
TEST_DIR = DATA_DIR / "test"
SPLITS_MANIFEST = DATA_DIR / "splits.json"
SPLIT_DIRS = {"train": TRAIN_DIR, "val": VAL_DIR, "test": TEST_DIR}

RUNS_DIR = ROOT / "runs"
MODELS_DIR = ROOT / "models"
ARTIFACTS_DIR = ROOT / "artifacts"
LATEST_FILE = MODELS_DIR / "LATEST"  # contiene el run_id del último run terminado con éxito
DOCS_DIR = ROOT / "docs"
DECISIONS_FILE = DOCS_DIR / "DECISIONES.md"  # lo muestra el explorador (make explore)
EXPLORER_APP = ROOT / "app" / "explorador.py"
EXPLORER_CSS = ROOT / "app" / "estilo.css"  # estilo propio; el tema está en .streamlit/
WEB_DIR = ROOT / "web"
WEB_MODEL_DIR = WEB_DIR / "public" / "model"  # ONNX, manifiesto y ejemplos (make export-web)
WEB_DATA_DIR = WEB_DIR / "public" / "data"  # mercado y calidad en la forma del contrato de Sonda


def run_paths(run_id: str) -> dict[str, Path]:
    """Las tres carpetas asociadas a un run."""
    return {
        "run": RUNS_DIR / run_id,
        "model": MODELS_DIR / run_id,
        "artifacts": ARTIFACTS_DIR / run_id,
    }


def latest_run_id() -> str:
    if not LATEST_FILE.exists():
        raise FileNotFoundError("Todavía no hay ningún run terminado. Ejecuta `make train`.")
    return LATEST_FILE.read_text(encoding="utf-8").strip()


def relative(path: Path) -> str:
    """Ruta relativa a la raíz (portable entre ordenadores) si es posible."""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)
