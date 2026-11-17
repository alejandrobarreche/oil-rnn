"""Actualización diaria de los datos de la web, sin reentrenar.

    make update

Descarga las mismas series que `make data` hasta hoy (data.source con end = null), las limpia con
la misma regla que `make prepare` (corte en la última observación real del target y ffill) y
reescribe web/public/data/market.json. La web pasa esas filas por las redes ya entrenadas (ONNX)
en el navegador, así que la predicción de hoy cambia sin tocar los pesos.

No modifica data/raw/, los splits ni ningún run: la descarga se guarda en data/live/. El
preprocesado (medias y escalas) sigue siendo el ajustado con train y guardado en el manifiesto.
Lo lanza a diario .github/workflows/update.yml; reentrenar sigue siendo `make train`, a mano.

Este módulo no importa torch ni onnxruntime: el workflow solo instala pandas y yfinance.
"""

from __future__ import annotations

import argparse
import copy
import json

import numpy as np
import pandas as pd

from .config import add_config_args, load_config
from .data import clean
from .paths import LIVE_DIR, WEB_DATA_DIR, WEB_MODEL_DIR, relative

MARKET_FILE = WEB_DATA_DIR / "market.json"


def market(cfg: dict, df: pd.DataFrame, need: int, status: str) -> dict:
    """Histórico del target, sucesos del ciclo (web.events) y las últimas `need` filas de
    variables. `df` ya está limpio (data.clean). status: off = congelado en la descarga de
    entrenamiento; live = actualizado con `make update`."""
    time_col, target = cfg["data"]["time_column"], cfg["data"]["target"]
    features = list(cfg["data"]["features"])
    last, prev = df[target].iloc[-1], df[target].iloc[-2]
    tail = df.tail(need)
    series = df.set_index(pd.to_datetime(df[time_col]))[target]
    events = []
    for e in cfg["web"].get("events", []):
        part = series[e["start"] : e["end"]]
        if part.empty:
            continue
        t = part.idxmax() if e["kind"] == "max" else part.idxmin()
        events.append({**e, "t": str(t.date()), "price": float(part[t])})
    return {
        "asset": target.upper(),
        "last": float(last),
        "change": float(last - prev),
        "ts": str(df[time_col].iloc[-1])[:10],
        "status": status,
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


def rows_needed(manifest: dict) -> int:
    """Filas de historia que necesita el modelo más exigente (ventana + calentamiento)."""
    return max(m["window"] + m["warmup"] for m in manifest["models"])


def check_update(new: dict, old: dict | None, manifest: dict) -> None:
    """Comprueba la descarga antes de escribirla: mismas features que el manifiesto, filas
    suficientes y sin huecos, y que no retrocede respecto al market.json actual."""
    for m in manifest["models"]:
        if m["features"] != new["features"]:
            raise ValueError(f"h={m['horizon']}: features distintas en manifest y data.features")
    values = np.asarray(new["rows"]["values"], np.float64)
    if len(values) < rows_needed(manifest):
        raise ValueError(
            f"Solo hay {len(values)} filas; el modelo necesita {rows_needed(manifest)}"
        )
    if not np.isfinite(values).all():
        raise ValueError("Las últimas filas tienen valores vacíos tras el ffill")
    if old is not None and new["ts"] < old["ts"]:
        raise ValueError(f"La descarga acaba el {new['ts']}, antes que market.json ({old['ts']})")


def update(cfg: dict) -> tuple[dict, dict | None]:
    """Descarga, limpia y escribe market.json. Devuelve el nuevo y el anterior."""
    from .sources import fetch

    live_cfg = copy.deepcopy(cfg)
    live_cfg["data"]["source"]["end"] = None  # hasta hoy
    raw = fetch(live_cfg)
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    raw.to_csv(LIVE_DIR / cfg["data"]["source"].get("filename", "dataset.csv"), index=False)

    df, _ = clean(raw, cfg)
    manifest = json.loads((WEB_MODEL_DIR / "manifest.json").read_text(encoding="utf-8"))
    old = json.loads(MARKET_FILE.read_text("utf-8")) if MARKET_FILE.exists() else None
    new = market(cfg, df, rows_needed(manifest), status="live")
    check_update(new, old, manifest)
    MARKET_FILE.write_text(json.dumps(new, indent=1, ensure_ascii=False), encoding="utf-8")
    return new, old


def main(argv: list[str] | None = None) -> None:
    parser = add_config_args(
        argparse.ArgumentParser(description="Datos nuevos para la web, sin reentrenar")
    )
    args = parser.parse_args(argv)
    new, old = update(load_config(args.config, args.overrides))
    before = old["ts"] if old else "—"
    print(f"{relative(MARKET_FILE)}: datos hasta el {new['ts']} (antes {before})")
    print(f"Brent: {new['last']:.2f} $ ({new['change']:+.2f} $ respecto al día anterior)")


if __name__ == "__main__":
    main()
