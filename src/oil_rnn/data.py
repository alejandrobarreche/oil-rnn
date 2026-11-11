"""Datos: crea los splits train/val/test a partir de data/raw y los carga.

make prepare
make prepare ARGS="--set data.test_size=0.2"

Serie temporal: los splits son tramos consecutivos en el tiempo (train → val → test), nunca
mezclados, para no entrenar con información del futuro.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from .config import add_config_args, get, load_config, require
from .paths import RAW_DIR, SPLIT_DIRS, SPLITS_MANIFEST, relative

READERS = {".csv": pd.read_csv, ".parquet": pd.read_parquet}
SPLITS = ("train", "val", "test")
CONTEXT_COLUMN = "_context"  # filas añadidas solo como historia, no se predicen


def file_sha256(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def read_table(path: Path, na_values: list[str] | None = None) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path, na_values=na_values or None)
    if suffix == ".parquet":
        return pd.read_parquet(path)
    raise ValueError(f"Formato no soportado: {path.suffix} (usa .csv o .parquet)")


def raw_path(cfg: dict) -> Path:
    """Archivo de data/raw/ que se usa: data.raw_file o, si no está, data.source.filename."""
    name = get(cfg, "data.raw_file") or get(cfg, "data.source.filename")
    require({"data": {"raw_file": name}}, "data.raw_file")
    return RAW_DIR / name


def _check_columns(df: pd.DataFrame, columns: list[str], source: Path) -> None:
    absent = [c for c in columns if c not in df.columns]
    if absent:
        available = ", ".join(map(str, df.columns))
        raise KeyError(f"No están en {source.name}: {absent}. Disponibles: {available}")


def missing_report(parts: dict[str, pd.DataFrame]) -> dict[str, dict[str, int]]:
    """Valores vacíos por split y columna (solo las columnas que tienen alguno)."""
    report = {}
    for name, part in parts.items():
        counts = part.isna().sum()
        report[name] = {str(c): int(n) for c, n in counts.items() if n > 0}
    return report


def _split(df: pd.DataFrame, cfg: dict) -> tuple[dict[str, pd.DataFrame], dict]:
    dcfg = cfg["data"]
    target, time_col = dcfg["target"], dcfg["time_column"]
    df = df.copy()
    df[time_col] = pd.to_datetime(df[time_col])
    df = df.sort_values(time_col).drop_duplicates(time_col).reset_index(drop=True)

    # Corte en la última observación real del target: si la fuente publica con retraso,
    # rellenar después inventaría los últimos valores de lo que se predice.
    last_real = df[target].last_valid_index()
    info = {"rows_after_last_target": int(len(df) - 1 - last_real)}
    df = df.loc[:last_real]
    info["missing_before_fill"] = int(df.isna().sum().sum())
    if dcfg.get("fill_missing") == "ffill":
        df = df.ffill()  # solo valores pasados: nunca información posterior
    rows = len(df)
    df = df.dropna(subset=[target]).reset_index(drop=True)
    info["rows_dropped_no_target"] = rows - len(df)

    n = len(df)
    n_test = int(round(n * float(dcfg["test_size"])))
    n_val = int(round(n * float(dcfg["val_size"])))
    parts = {
        "train": df.iloc[: n - n_val - n_test],
        "val": df.iloc[n - n_val - n_test : n - n_test],
        "test": df.iloc[n - n_test :],
    }
    info["ranges"] = {k: [str(v[time_col].min()), str(v[time_col].max())] for k, v in parts.items()}
    return parts, info


def prepare_data(cfg: dict) -> dict:
    """Divide el archivo de data/raw/ en train/val/test y escribe data/splits.json."""
    require(cfg, "data.target", "data.time_column", "data.val_size", "data.test_size")
    dcfg = cfg["data"]
    path = raw_path(cfg)
    if not path.exists():
        raise FileNotFoundError(
            f"No existe {relative(path)}: ejecuta `make data` o cópialo a mano."
        )
    df = read_table(path, dcfg.get("na_values"))
    _check_columns(df, [dcfg["target"], dcfg["time_column"]], path)
    parts, info = _split(df, cfg)

    manifest = {
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": {"file": relative(path), "sha256": file_sha256(path), "rows": len(df)},
        "target": dcfg["target"],
        **info,
        "missing": missing_report(parts),
        "splits": {},
    }
    for name, part in parts.items():
        folder = SPLIT_DIRS[name]
        folder.mkdir(parents=True, exist_ok=True)
        out = folder / f"{name}.parquet"
        part.to_parquet(out, index=False)
        manifest["splits"][name] = {
            "file": relative(out),
            "rows": len(part),
            "sha256": file_sha256(out),
        }
    SPLITS_MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest


def _read_split(name: str) -> pd.DataFrame:
    folder = SPLIT_DIRS[name]
    files = sorted(p for p in folder.glob("*") if p.suffix.lower() in READERS)
    if not files:
        raise FileNotFoundError(f"No hay datos en {relative(folder)}. Ejecuta `make prepare`.")
    return pd.concat([read_table(p) for p in files], ignore_index=True)


def load_split(name: str, context: int = 0) -> pd.DataFrame:
    """Carga data/<name>/. Con context > 0 antepone las últimas filas de los splits anteriores,
    marcadas en la columna _context: sirven de historia para las primeras ventanas, pero no se
    predicen ni cuentan en las métricas."""
    df = _read_split(name).assign(**{CONTEXT_COLUMN: False})
    previous = SPLITS[: SPLITS.index(name)]
    if context > 0 and previous:
        history = pd.concat([_read_split(p) for p in previous], ignore_index=True).tail(context)
        df = pd.concat([history.assign(**{CONTEXT_COLUMN: True}), df], ignore_index=True)
    return df


def data_fingerprint() -> dict:
    """Qué datos se usaron: se guarda en el meta.json de cada run."""
    if SPLITS_MANIFEST.exists():
        m = json.loads(SPLITS_MANIFEST.read_text(encoding="utf-8"))
        return {
            "manifest": relative(SPLITS_MANIFEST),
            "source": m["source"],
            "splits": {k: v["sha256"] for k, v in m["splits"].items()},
        }
    return {"manifest": None, "note": "splits creados a mano, sin data/splits.json"}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Crea data/train, data/val y data/test")
    args = add_config_args(parser).parse_args(argv)
    manifest = prepare_data(load_config(args.config, args.overrides))
    for name, info in manifest["splits"].items():
        print(f"  {name:<5} {info['rows']:>8} filas  →  {info['file']}")
    for name, (start, end) in manifest["ranges"].items():
        print(f"  {name:<5} {start}  …  {end}")
    if manifest["rows_after_last_target"]:
        n_cut = manifest["rows_after_last_target"]
        print(f"  Cortadas {n_cut} filas posteriores al último valor real del target")
    for name, cols in manifest["missing"].items():
        if cols:
            detail = ", ".join(f"{c} ({n})" for c, n in cols.items())
            print(f"  ⚠ Vacíos en {name}: {detail}")
    print(f"Manifiesto: {relative(SPLITS_MANIFEST)}")


if __name__ == "__main__":
    main()
