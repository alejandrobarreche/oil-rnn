"""Utilidades de runs.

make runs                         tabla de todos los runs
make pack RUN=<run_id>            empaqueta runs/, models/ y artifacts/ de un run en un .zip
make unpack ZIP=<archivo.zip>     lo restaura (por ejemplo, para traer los pesos a otra máquina)
make mlflow-ui                    abre la interfaz de MLflow
"""

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

from .paths import LATEST_FILE, ROOT, RUNS_DIR, latest_run_id, relative, run_paths


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def list_runs(n_metrics: int = 3) -> None:
    latest = LATEST_FILE.read_text(encoding="utf-8").strip() if LATEST_FILE.exists() else None
    metas = sorted(RUNS_DIR.glob("*/meta.json"))
    if not metas:
        print("No hay runs todavía. Ejecuta `make train`.")
        return
    for meta_path in metas:
        meta = _read_json(meta_path)
        summary = _read_json(meta_path.parent / "metrics.json")
        evals = {k: v for k, v in summary.items() if k.startswith("test_")}
        shown = evals or {
            k: v for k, v in summary.items() if k.startswith("val_") and k != "val_loss"
        }
        metrics = "  ".join(f"{k}={v:.4f}" for k, v in list(shown.items())[:n_metrics])
        mark = "*" if meta.get("run_id") == latest else " "
        print(
            f"{mark} {meta.get('run_id', meta_path.parent.name):<45} "
            f"{meta.get('status', '?'):<9} {metrics}"
        )
    print("\n* = models/LATEST (el que usa `evaluate` por defecto)")


def unpack_run(zip_path: str) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if name.split("/")[0] not in {"runs", "models", "artifacts"} or ".." in name:
                raise ValueError(f"Entrada inesperada en el zip: {name}")
        zf.extractall(ROOT)
    print(f"Run restaurado desde {zip_path}. Míralo con `make runs`.")


def pack_run(run_id: str | None = None) -> None:
    run_id = run_id or latest_run_id()
    out = ROOT / f"{run_id}.run.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for folder in run_paths(run_id).values():
            for file in folder.rglob("*"):
                if file.is_file():
                    zf.write(file, file.relative_to(ROOT).as_posix())
    print(f"Empaquetado: {relative(out)}  (runs/ + models/ + artifacts/ de {run_id})")


def mlflow_ui(port: str = "5000") -> None:
    import subprocess
    import sys

    from .config import load_config
    from .tracking import tracking_uri

    uri = tracking_uri(load_config())
    if not uri.startswith("sqlite"):
        print(f"MLflow apunta a un servidor remoto: abre {uri} en el navegador.")
        return
    print(f"MLflow UI en http://127.0.0.1:{port}  (Ctrl+C para salir)")
    subprocess.run(
        [sys.executable, "-m", "mlflow", "ui", "--backend-store-uri", uri, "--port", port],
        check=False,
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Utilidades de runs")
    parser.add_argument(
        "--pack",
        nargs="?",
        const="",
        metavar="RUN_ID",
        help="Empaqueta un run (por defecto el último)",
    )
    parser.add_argument("--unpack", metavar="ZIP", help="Restaura un run empaquetado")
    parser.add_argument("--mlflow-ui", action="store_true", help="Abre la interfaz de MLflow")
    args = parser.parse_args(argv)
    if args.pack is not None:
        pack_run(args.pack or None)
    elif args.unpack:
        unpack_run(args.unpack)
    elif args.mlflow_ui:
        mlflow_ui()
    else:
        list_runs()


if __name__ == "__main__":
    main()
