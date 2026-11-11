"""Exporta un modelo entrenado para la web estática (web/public/model/).

    make export-web                     # último run
    make export-web RUN=<run_id> RELEASE=model-v2

Genera:
    model.onnx      la red en formato ONNX (no se sube a git: se publica como Release)
    manifest.json   features, parámetros del preprocesado, hash del modelo y Release de origen
    examples.json   entradas de ejemplo y la salida que da Python, para la prueba de paridad

La web replica el preprocesado de features.py en web/src/model.ts con los parámetros del
manifiesto; `make web-test` comprueba que TypeScript y Python dan el mismo resultado.
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import onnxruntime as ort
import torch

from .data import file_sha256, load_split
from .model import Predictor
from .paths import MODELS_DIR, WEB_DIR, latest_run_id, relative

OUT_DIR = WEB_DIR / "public" / "model"
N_EXAMPLES = 3


def _preprocessing(prep) -> dict:
    return {
        "features": prep.features,
        "window": prep.window,
        "horizon": prep.horizon,
        "target_mode": prep.target_mode,
        "target_index": prep.features.index(prep.target) if prep.target in prep.features else None,
        "x_mean": prep.x_mean.tolist(),
        "x_scale": prep.x_scale.tolist(),
        "y_mean": prep.y_mean,
        "y_scale": prep.y_scale,
    }


def _examples(predictor: Predictor) -> list[dict]:
    prep = predictor.preprocessor
    if prep.target_mode == "change" and prep.target not in prep.features:
        raise ValueError("Con target_mode=change el target debe estar entre las features")
    df = load_split("test").tail(prep.window + N_EXAMPLES - 1).reset_index(drop=True)
    rows = df[prep.features].to_numpy(np.float64)
    examples = []
    for i in range(N_EXAMPLES):
        window = rows[i : i + prep.window]
        x = prep.scale_features(window)[None]
        last = window[-1, prep.features.index(prep.target)] if prep.target in prep.features else 0
        pred = prep.inverse_target(predictor.forward(x), np.array([last]))
        examples.append({"rows": window.tolist(), "expected": [float(pred[0])]})
    return examples


def _dummy_input(prep) -> torch.Tensor:
    return torch.zeros(2, prep.window, prep.n_features)


def export(run_id: str, release: str) -> dict:
    predictor = Predictor.load(MODELS_DIR / run_id)
    prep, card = predictor.preprocessor, predictor.card
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = OUT_DIR / "model.onnx"

    dummy = _dummy_input(prep)
    torch.onnx.export(
        predictor.net,
        (dummy,),
        onnx_path,
        input_names=["input"],
        output_names=["output"],
        dynamo=True,
        dynamic_shapes=({0: torch.export.Dim("batch")},),
        external_data=False,  # pesos dentro de model.onnx: un único archivo para la web
    )
    # Paridad Python: ONNX Runtime debe dar lo mismo que PyTorch antes de publicar nada.
    session = ort.InferenceSession(onnx_path)
    check = torch.randn_like(dummy).numpy()
    diff = np.abs(session.run(None, {"input": check})[0] - predictor.forward(check)).max()
    if diff > 1e-4:
        raise RuntimeError(f"ONNX y PyTorch difieren ({diff:.2e}): no se exporta")

    manifest = {
        "run_id": run_id,
        "task": card["task"],
        "data_kind": card["data_kind"],
        "target": card["target"],
        "classes": card["classes"],
        **_preprocessing(prep),
        "model_file": onnx_path.name,
        "sha256": file_sha256(onnx_path),
        "release": release,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    examples = _examples(predictor)
    (OUT_DIR / "examples.json").write_text(json.dumps(examples, indent=2))
    return manifest


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Exporta un run para la web estática")
    parser.add_argument("--run", default=None, help="run_id (por defecto el último)")
    parser.add_argument("--release", default="model-v1", help="Release de GitHub del modelo")
    args = parser.parse_args(argv)
    manifest = export(args.run or latest_run_id(), args.release)
    print(f"Exportado {manifest['run_id']} → {relative(OUT_DIR)}")
    print(f"Publica el modelo con: make web-release RELEASE={manifest['release']}")


if __name__ == "__main__":
    main()
