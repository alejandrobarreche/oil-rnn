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

READERS = {".csv": pd.read_csv, ".parquet": pd.read_parquet, ".pkl": pd.read_pickle}
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
    if suffix == ".pkl":
        return pd.read_pickle(path)
    raise ValueError(f"Formato no soportado: {path.suffix} (usa .csv, .parquet o .pkl)")


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


def feature_columns(df: pd.DataFrame, features: str | list[str], time_column: str) -> list[str]:
    """Columnas de entrada: la lista de data.features o, con «all», todas las numéricas."""
    if features == "all":
        numeric = df.select_dtypes(include="number").columns
        return [c for c in numeric if c not in (time_column, CONTEXT_COLUMN)]
    return list(features)


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

    # Recorte del comienzo: ffill no puede rellenar antes del primer dato de cada serie, así que
    # los datos empiezan en la primera fila con todas las features. Se hace antes de dividir.
    features = feature_columns(df, dcfg["features"], time_col)
    complete = df[features].notna().all(axis=1)
    if not complete.any():
        raise ValueError(f"Ninguna fila tiene todas las features {features}")
    first = int(complete.to_numpy().argmax())
    df = df.iloc[first:].reset_index(drop=True)
    info["rows_dropped_incomplete_start"] = first
    info["first_complete_date"] = str(df[time_col].iloc[0])

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
    require(
        cfg, "data.target", "data.features", "data.time_column", "data.val_size", "data.test_size"
    )
    dcfg = cfg["data"]
    path = raw_path(cfg)
    if not path.exists():
        raise FileNotFoundError(
            f"No existe {relative(path)}: ejecuta `make data` o cópialo a mano."
        )
    df = read_table(path, dcfg.get("na_values"))
    features = feature_columns(df, dcfg["features"], dcfg["time_column"])
    _check_columns(df, [dcfg["target"], dcfg["time_column"], *features], path)
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
        # Se borran los splits anteriores: _read_split concatena todo lo que hay en la carpeta.
        for old in folder.glob("*"):
            if old.suffix.lower() in READERS:
                old.unlink()
        # Pickle y no parquet: Smart App Control (Windows) bloquea las DLL de pyarrow.
        out = folder / f"{name}.pkl"
        part.reset_index(drop=True).to_pickle(out)
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


def load_train_val() -> pd.DataFrame:
    """train + val en orden: el tramo de desarrollo (pliegues walk-forward y modelo final)."""
    return pd.concat([_read_split("train"), _read_split("val")], ignore_index=True)


def segment(df: pd.DataFrame, start: int, end: int, history: int) -> pd.DataFrame:
    """Filas [start, end) para predecir, precedidas de `history` filas de contexto (marcadas en
    _context: sirven de entrada a las primeras ventanas, no se predicen)."""
    lo = max(0, start - history)
    part = df.iloc[lo:end].reset_index(drop=True)
    return part.assign(**{CONTEXT_COLUMN: part.index < start - lo})


def training_bounds(boundary: int, horizon: int, holdout: int) -> tuple[int, int, int]:
    """Filas de entrenamiento antes de `boundary`, la primera fila que se predice después.

    Purga: la primera predicción tras la frontera se hace desde boundary - horizon, así que
    ningún target de entrenamiento puede ser posterior a esa fila (si no, la red habría visto
    precios futuros a ese instante). Lo mismo entre el ajuste y el tramo de early stopping.

    Devuelve (fit_end, stop_start, stop_end): se ajusta con targets en [0, fit_end) y se para
    con los de [stop_start, stop_end), los `holdout` últimos antes de la purga."""
    stop_end = boundary - horizon + 1
    stop_start = stop_end - holdout
    fit_end = stop_start - horizon + 1
    if fit_end <= 0:
        raise ValueError(f"No quedan filas de ajuste antes de la fila {boundary}")
    return fit_end, stop_start, stop_end


def training_segments(
    df: pd.DataFrame, boundary: int, horizon: int, holdout: int, history: int
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(ajuste, early stopping) con todo lo anterior a `boundary`, purgado."""
    fit_end, stop_start, stop_end = training_bounds(boundary, horizon, holdout)
    return df.iloc[:fit_end].reset_index(drop=True), segment(df, stop_start, stop_end, history)


def fold_boundaries(n: int, folds: int, block: int) -> list[tuple[int, int]]:
    """Bloques de evaluación walk-forward: `folds` tramos consecutivos de `block` filas que
    terminan en la fila n. Cada pliegue entrena con todo lo anterior a su bloque."""
    if folds * block >= n:
        raise ValueError(f"{folds} bloques de {block} filas no caben en {n} filas")
    return [(n - (folds - k) * block, n - (folds - k - 1) * block) for k in range(folds)]


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
