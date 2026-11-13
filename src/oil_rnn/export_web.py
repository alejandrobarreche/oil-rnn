"""Exporta los modelos elegidos (uno por horizonte, `web.models` en config.yaml) para la web.

    make export-web                     # con la Release por defecto
    make export-web RELEASE=model-v2
    make export-explain                 # solo web/public/data/explain.json (página explicativa)

Genera en web/public/model/:
    h<h>.onnx       la red de cada horizonte (no se sube a git: se publica como Release)
    manifest.json   por horizonte: features, parámetros del preprocesado, calibración y hash
    examples.json   por horizonte: entradas de ejemplo y la salida de Python (prueba de paridad)

y en web/public/data/ (forma del contrato de datos de Sonda):
    market.json     histórico del target, sucesos del ciclo (web.events) y las últimas filas
    quality.json    por horizonte: métricas de test frente a las referencias y backtest de test

La web replica el preprocesado de features.py en web/src/model.ts con los parámetros del
manifiesto; `make web-test` comprueba que TypeScript y Python dan el mismo resultado.
"""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np
import onnxruntime as ort
import pandas as pd
import torch

from .config import load_config, require
from .conformal import calibrate_quantiles
from .data import SPLITS, file_sha256, load_split
from .model import Predictor
from .paths import (
    ARTIFACTS_DIR,
    MODELS_DIR,
    WEB_DATA_DIR,
    WEB_EXPLAIN_FILE,
    WEB_MODEL_DIR,
    relative,
    run_paths,
)

N_EXAMPLES = 3


def _preprocessing(prep) -> dict:
    return {
        "features": prep.features,
        "window": prep.window,
        "horizon": prep.horizon,
        "target_mode": prep.target_mode,
        "target_index": prep.features.index(prep.target) if prep.target in prep.features else None,
        "inputs": prep.inputs,
        "transforms": prep.transforms,
        "floor": [prep.floor.get(f) for f in prep.features],
        "volatility": prep.volatility,
        "clip": prep.clip,
        "warmup": prep.warmup,
        "x_mean": prep.x_mean.tolist(),
        "x_scale": prep.x_scale.tolist(),
        "y_mean": prep.y_mean,
        "y_scale": prep.y_scale,
    }


def _examples(predictor: Predictor) -> list[dict]:
    prep = predictor.preprocessor
    if prep.target_mode != "level" and prep.target not in prep.features:
        raise ValueError(
            f"Con target_mode={prep.target_mode} el target debe estar entre las features"
        )
    need = prep.window + prep.warmup
    df = load_split("test").tail(need + N_EXAMPLES - 1).reset_index(drop=True)
    rows = df[prep.features].to_numpy(np.float64)
    examples = []
    for i in range(N_EXAMPLES):
        window = rows[i : i + need]
        x = prep.window_from_rows(window)[None]
        last = window[-1, prep.features.index(prep.target)] if prep.target in prep.features else 0
        pred = prep.inverse_target(predictor.forward(x), np.array([last]))
        conf, quantiles = predictor.card.get("conformal"), predictor.card.get("quantiles")
        if conf and quantiles:
            pred = calibrate_quantiles(pred, quantiles, conf)
        expected = np.atleast_1d(pred[0]).tolist()  # un valor o uno por cuantil
        examples.append({"rows": window.tolist(), "expected": expected})
    return examples


def _export_onnx(predictor: Predictor, path) -> None:
    """Exporta a ONNX y comprueba que ONNX Runtime da lo mismo que PyTorch."""
    dummy = torch.zeros(2, predictor.preprocessor.window, predictor.preprocessor.n_features)
    torch.onnx.export(
        predictor.net,
        (dummy,),
        path,
        input_names=["input"],
        output_names=["output"],
        dynamo=True,
        dynamic_shapes=({0: torch.export.Dim("batch")},),
        external_data=False,  # pesos dentro del .onnx: un único archivo por modelo
        verbose=False,
    )
    session = ort.InferenceSession(path)
    check = torch.randn_like(dummy).numpy()
    diff = np.abs(session.run(None, {"input": check})[0] - predictor.forward(check)).max()
    if diff > 1e-4:
        raise RuntimeError(f"ONNX y PyTorch difieren ({diff:.2e}) en {path.name}: no se exporta")


def export_model(run_id: str, release: str) -> tuple[dict, list[dict]]:
    """ONNX de un run, su entrada del manifiesto y sus ejemplos de paridad."""
    predictor = Predictor.load(MODELS_DIR / run_id)
    prep, card = predictor.preprocessor, predictor.card
    onnx_path = WEB_MODEL_DIR / f"h{prep.horizon}.onnx"
    _export_onnx(predictor, onnx_path)
    run_cfg = load_config(run_paths(run_id)["run"] / "config.yaml")
    entry = {
        "run_id": run_id,
        "cell": run_cfg["model"]["cell"],
        "task": card["task"],
        "data_kind": card["data_kind"],
        "target": card["target"],
        "classes": card["classes"],
        "quantiles": card.get("quantiles"),
        "conformal": card.get("conformal"),
        **_preprocessing(prep),
        "model_file": onnx_path.name,
        "sha256": file_sha256(onnx_path),
        "release": release,
    }
    return entry, _examples(predictor)


def market(cfg: dict, need: int) -> dict:
    """Histórico del target (todos los splits) y las últimas `need` filas de variables."""
    time_col, target = cfg["data"]["time_column"], cfg["data"]["target"]
    df = pd.concat([load_split(s) for s in SPLITS], ignore_index=True)
    features = list(cfg["data"]["features"])
    last, prev = df[target].iloc[-1], df[target].iloc[-2]
    tail = df.tail(need)
    series = df.set_index(pd.to_datetime(df[time_col]))[target]
    events = []
    for e in cfg["web"].get("events", []):
        part = series[e["start"] : e["end"]]
        t = part.idxmax() if e["kind"] == "max" else part.idxmin()
        events.append({**e, "t": str(t.date()), "price": float(part[t])})
    return {
        "asset": target.upper(),
        "last": float(last),
        "change": float(last - prev),
        "ts": str(df[time_col].iloc[-1])[:10],
        "status": "off",  # datos congelados en la última descarga (data.source.end)
        "history": [
            {"t": str(t)[:10], "close": round(float(v), 4)}
            for t, v in zip(df[time_col], df[target], strict=True)
        ],
        "events": events,
        "features": features,
        "rows": {
            "t": [str(t)[:10] for t in tail[time_col]],
            "values": tail[features].to_numpy(np.float64).tolist(),
        },
    }


def quality(run_id: str, horizon: int) -> dict:
    """Métricas de test (make evaluate) frente a las referencias, y backtest de test."""
    m = json.loads((run_paths(run_id)["run"] / "eval_test.json").read_text("utf-8"))["metrics"]
    pred = pd.read_csv(ARTIFACTS_DIR / run_id / "predictions_test.csv")
    up = pred["y_true"] > pred["y_baseline"]
    up_share = float(up.mean())
    return {
        "asset": "BRENT",
        "model": run_id,
        "horizon": horizon,
        "period": [str(pred["time"].iloc[0]), str(pred["time"].iloc[-1])],
        "n": len(pred),
        "metrics": {
            "hit_rate": m["test_direction_accuracy"],
            "mae": m["test_mae"],
            "rmse": m["test_rmse"],
            "coverage80": m["test_coverage"],
            "pinball": m["test_pinball"],
        },
        # Referencias: persistencia (mae, rmse), cuantiles históricos (coverage80, pinball) y
        # dirección constante: la más frecuente en train y la más frecuente en test (a posteriori).
        "baseline": {
            "mae": m["test_baseline_mae"],
            "rmse": m["test_baseline_rmse"],
            "coverage80": m["test_baseline_coverage"],
            "pinball": m["test_baseline_pinball"],
            "hit_rate_train_majority": m["test_baseline_direction_accuracy"],
            "hit_rate_best_constant": max(up_share, 1 - up_share),
            "best_constant": "up" if up_share >= 0.5 else "down",
        },
        "backtest": [
            {
                "t": str(r.time),
                "actual": round(r.y_true, 4),
                "pred": round(r.y_pred, 4),
                "lo80": round(r.y_lo, 4),
                "hi80": round(r.y_hi, 4),
                "persistence": round(r.y_baseline, 4),
            }
            for r in pred.itertuples()
        ],
    }


def export(cfg: dict, release: str) -> dict:
    require(cfg, "web.models")
    runs = {int(h): str(r) for h, r in cfg["web"]["models"].items()}
    WEB_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    models, examples = [], {}
    for h, run_id in sorted(runs.items()):
        entry, ex = export_model(run_id, release)
        if entry["horizon"] != h:
            raise ValueError(f"web.models[{h}] apunta a un run de horizonte {entry['horizon']}")
        models.append(entry)
        examples[str(h)] = ex
    manifest = {"release": release, "asset": cfg["data"]["target"].upper(), "models": models}
    need = max(m["window"] + m["warmup"] for m in models)

    def write(path, obj) -> None:
        path.write_text(json.dumps(obj, indent=1, ensure_ascii=False), encoding="utf-8")

    write(WEB_MODEL_DIR / "manifest.json", manifest)
    write(WEB_MODEL_DIR / "examples.json", examples)
    write(WEB_DATA_DIR / "market.json", market(cfg, need))
    write(WEB_DATA_DIR / "quality.json", [quality(runs[h], h) for h in sorted(runs)])
    return manifest


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Exporta los modelos de web.models para la web")
    parser.add_argument("--release", default="model-v1", help="Release de GitHub de los modelos")
    parser.add_argument(
        "--explain", action="store_true", help="Solo los datos de la página explicativa"
    )
    args = parser.parse_args(argv)
    if args.explain:
        from .explore import explain_data

        data = explain_data(load_config())
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        WEB_EXPLAIN_FILE.write_text(text, encoding="utf-8")
        print(f"{relative(WEB_EXPLAIN_FILE)}: {len(text) / 1024:.0f} KB")
        return
    sys.stdout.reconfigure(encoding="utf-8")  # torch.onnx escribe emojis; cp1252 fallaría
    manifest = export(load_config(), args.release)
    for m in manifest["models"]:
        print(f"h={m['horizon']:<4} {m['cell']:<5} {m['run_id']} → {m['model_file']}")
    print(f"Exportado a {relative(WEB_MODEL_DIR)} y {relative(WEB_DATA_DIR)}")
    print(f"Publica los modelos con: make web-release RELEASE={manifest['release']}")


if __name__ == "__main__":
    main()
