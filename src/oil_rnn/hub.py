"""Publica en Hugging Face los modelos de `web.models` (uno por horizonte).

    make hub-upload HF_REPO=<usuario>/oil-rnn                 # todos los horizontes
    make hub-upload HF_REPO=<usuario>/oil-rnn HORIZONS=5      # solo esos (el resto queda igual)
    make hub-upload HF_REPO=<usuario>/oil-rnn ARGS=--dry-run  # arma la carpeta sin subir nada

Estructura del repositorio de modelos:
    README.md                 model card: datos, preprocesado y métricas de test con sus referencias
    onnx/manifest.json        el de web/public/model (parámetros del preprocesado de la web)
    onnx/h<h>.onnx            la red de cada horizonte; su sha256 se comprueba con el manifiesto
    pytorch/h<h>/             models/<run_id>/ (pesos, preprocesador, model card) y la config
                              y meta del run

Las métricas salen de web/public/data/quality.json (make export-web); no se calcula nada nuevo.
La sesión se toma de `hf auth login` o de HF_TOKEN en .env.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

from .config import load_config, require
from .data import file_sha256
from .paths import WEB_DATA_DIR, WEB_MODEL_DIR, relative, run_paths

PYTORCH_RUN_FILES = ("config.yaml", "meta.json")  # de runs/<id>/, para reproducir el run


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _fmt(x: float | None, digits: int = 2) -> str:
    return "—" if x is None else f"{x:.{digits}f}".replace(".", ",")


def model_card(manifest: dict, quality: list[dict], github_repo: str) -> str:
    """README.md del repositorio de modelos, solo con datos del manifiesto y de quality.json."""
    models = {m["horizon"]: m for m in manifest["models"]}
    rows = []
    for q in sorted(quality, key=lambda q: q["horizon"]):
        m, b = q["metrics"], q["baseline"]
        cell = models.get(q["horizon"], {}).get("cell", "—")
        rows.append(
            f"| {q['horizon']} | {cell.upper()} | {q['n']} "
            f"| {_fmt(m['mae'])} | {_fmt(b['mae'])} | {_fmt(m['rmse'])} | {_fmt(b['rmse'])} "
            f"| {_fmt(m['coverage80'])} | {_fmt(b['coverage80'])} "
            f"| {_fmt(m['hit_rate'])} | {_fmt(b['hit_rate_best_constant'])} |"
        )
    period = quality[0]["period"] if quality else ["—", "—"]
    first = next(iter(models.values()), {})
    features = ", ".join(f"`{f}`" for f in first.get("features", []))
    runs = "\n".join(
        f"- h = {h}: `{m['run_id']}` (ventana {m['window']}, objetivo `{m['target_mode']}`)"
        for h, m in sorted(models.items())
    )
    return f"""---
tags:
- time-series-forecasting
- pytorch
- onnx
- brent
- recurrent-neural-network
pipeline_tag: time-series-forecasting
---

# oil-rnn: precio spot del Brent con redes recurrentes

Un modelo por horizonte (5, 21, 63 y 252 días hábiles) que predice el rendimiento logarítmico
del Brent spot (EIA, `DCOILBRENTEU`) y su intervalo del 80 %, calibrado con conformal.
Código, datos y método: <https://github.com/{github_repo}>.

## Modelos

{runs}

Entradas: {features}.

## Métricas de test

Periodo {period[0]} a {period[1]}, en $/barril. La referencia es la persistencia (precio de hoy)
para el error y la cobertura, y la mejor constante de train para el acierto de dirección.

| h | Red | n | MAE | MAE ref. | RMSE | RMSE ref. | Cob. 80 % | Cob. ref. | Acierto | Acierto ref. |
|---|---|---|---|---|---|---|---|---|---|---|
{chr(10).join(rows)}

## Archivos

- `onnx/h<h>.onnx` y `onnx/manifest.json`: lo que ejecuta la web (ONNX Runtime Web). El
  manifiesto trae las features, la ventana y los parámetros de escalado de cada horizonte.
- `pytorch/h<h>/`: pesos (`model.pt`), preprocesador ajustado solo con train
  (`preprocessor.joblib`), `model_card.json`, y la `config.yaml` y `meta.json` del run.

`preprocessor.joblib` y `model.pt` se cargan con pickle: ábrelos solo si confías en el origen.

## Limitaciones

Datos diarios cortados en la última observación real del Brent; splits cronológicos
train → val → test. Las métricas de la tabla indican cuándo la red no mejora a su referencia.
"""


def stage(cfg: dict, out: Path, horizons: set[int] | None, github_repo: str) -> list[int]:
    """Copia en `out` lo que se sube. Devuelve los horizontes incluidos."""
    require(cfg, "web.models")
    runs = {int(h): str(r) for h, r in cfg["web"]["models"].items()}
    if horizons is not None:
        unknown = horizons - runs.keys()
        if unknown:
            raise ValueError(f"Horizontes sin modelo en web.models: {sorted(unknown)}")
        runs = {h: r for h, r in runs.items() if h in horizons}

    manifest = _read_json(WEB_MODEL_DIR / "manifest.json")
    entries = {m["horizon"]: m for m in manifest["models"]}
    missing = []
    for h, run_id in runs.items():
        entry = entries.get(h)
        if entry is None or entry["run_id"] != run_id:
            raise ValueError(f"manifest.json no tiene el run {run_id} para h={h}: make export-web")
        onnx = WEB_MODEL_DIR / entry["model_file"]
        if not onnx.exists() or file_sha256(onnx) != entry["sha256"]:
            raise ValueError(f"{relative(onnx)} falta o no coincide con el hash del manifiesto")
        paths = run_paths(run_id)
        if not (paths["model"] / "model.pt").exists():
            missing.append(f"h={h}: {relative(paths['model'])}")
    if missing:
        raise FileNotFoundError(
            "Faltan los pesos en esta máquina (make unpack, o HORIZONS= con los que hay):\n  "
            + "\n  ".join(missing)
        )

    (out / "onnx").mkdir(parents=True, exist_ok=True)
    shutil.copy2(WEB_MODEL_DIR / "manifest.json", out / "onnx" / "manifest.json")
    for h, run_id in sorted(runs.items()):
        shutil.copy2(WEB_MODEL_DIR / entries[h]["model_file"], out / "onnx")
        dest = out / "pytorch" / f"h{h}"
        paths = run_paths(run_id)
        shutil.copytree(paths["model"], dest, dirs_exist_ok=True)
        for name in PYTORCH_RUN_FILES:
            if (paths["run"] / name).exists():
                shutil.copy2(paths["run"] / name, dest / name)

    quality = _read_json(WEB_DATA_DIR / "quality.json")
    (out / "README.md").write_text(model_card(manifest, quality, github_repo), encoding="utf-8")
    return sorted(runs)


def upload(folder: Path, repo_id: str, private: bool, message: str) -> str:
    from huggingface_hub import HfApi  # grupo opcional hub: make hub-install

    api = HfApi()
    api.create_repo(repo_id, repo_type="model", private=private, exist_ok=True)
    info = api.upload_folder(
        folder_path=folder, repo_id=repo_id, repo_type="model", commit_message=message
    )
    return str(info)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Sube los modelos de web.models a Hugging Face")
    parser.add_argument("--repo", required=True, help="Repositorio de modelos: <usuario>/<nombre>")
    parser.add_argument("--github", required=True, help="Repositorio de GitHub del código")
    parser.add_argument(
        "--horizons",
        type=lambda s: {int(h) for h in s.split(",")},
        default=None,
        help="Solo estos horizontes (5,21…); los demás no se tocan en Hugging Face",
    )
    parser.add_argument("--private", action="store_true", help="Crea el repositorio privado")
    parser.add_argument("--dry-run", action="store_true", help="Arma la carpeta y no sube nada")
    args = parser.parse_args(argv)

    cfg = load_config()
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        horizons = stage(cfg, folder, args.horizons, args.github)
        files = sorted(p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file())
        print(f"Horizontes {horizons}: {len(files)} archivos")
        for f in files:
            print(f"  {f}")
        if args.dry_run:
            print("--dry-run: no se ha subido nada")
            return
        message = "Modelos h=" + ",".join(map(str, horizons))
        print(upload(folder, args.repo, args.private, message))


if __name__ == "__main__":
    main()
