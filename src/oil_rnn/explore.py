"""Vistas de solo lectura del proceso: las usan los cuadernos 02–05 y el explorador (make explore).

No entrena ni escribe en runs/ ni artifacts/: reconstruye cada etapa con las mismas funciones
que el entrenamiento (data.py, features.py) y lee los resultados que ya están guardados.

    pipeline_stages   el archivo de data/raw/ en cada etapa de make prepare
    input_stages      cada entrada de la red: valor, transformada, estandarizada y recortada
    window_at         la ventana que ve la red un día concreto y lo que tiene que predecir
    fold_table        fechas de ajuste, parada y evaluación de cada pliegue y del modelo final
    runs_table        una fila por run con su configuración y sus métricas
    cell_trace        una RNN, LSTM o GRU paso a paso en NumPy (estados y puertas)
    significance      Diebold-Mariano de cada modelo final frente a la persistencia en test
    futures_naive     persistencia actualizada con el futuro del Brent, en los bloques de make cv
    explain_data      todo lo que dibuja la página explicativa (make export-explain)

    make dm             imprime `significance()`
    make naive-futures  imprime `futures_naive()`
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from .data import (
    feature_columns,
    fold_boundaries,
    load_train_val,
    raw_path,
    read_table,
    training_bounds,
)
from .features import Preprocessor
from .metrics import diebold_mariano
from .paths import RUNS_DIR, SPLITS_MANIFEST, WEB_DATA_DIR, WEB_MODEL_DIR, run_paths

STAGES = ("bruto", "corte", "relleno", "inicio")
STAGE_LABELS = {
    "bruto": "1. Archivo descargado",
    "corte": "2. Hasta el último target real",
    "relleno": "3. Huecos rellenados (ffill)",
    "inicio": "4. Desde la primera fila completa",
}
GATES = {"rnn": (), "lstm": ("i", "f", "g", "o"), "gru": ("r", "z", "n")}  # orden de PyTorch
_NAME = re.compile(
    r"^(?P<prefix>[a-z0-9]+)-(?P<cell>rnn|lstm|gru)-h(?P<horizon>\d+)"
    r"(?:-n(?P<hidden>\d+)-l(?P<layers>\d+)-d(?P<dropout>[\d.-]+)-lr(?P<lr>[\de.-]+))?$"
)
_FOLD = re.compile(r"^fold(\d+)_(.+)$")


# ── Proceso del dato ───────────────────────────────────────
def pipeline_stages(cfg: dict, raw: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    """El archivo de data/raw/ tras cada paso de `make prepare` (los de data._split, en orden).
    La última etapa es lo que se divide en train, val y test."""
    dcfg = cfg["data"]
    target, time_col = dcfg["target"], dcfg["time_column"]
    df = read_table(raw_path(cfg), dcfg.get("na_values")) if raw is None else raw.copy()
    df[time_col] = pd.to_datetime(df[time_col])
    df = df.sort_values(time_col).drop_duplicates(time_col).reset_index(drop=True)
    stages = {"bruto": df}

    df = df.loc[: df[target].last_valid_index()]
    stages["corte"] = df
    if dcfg.get("fill_missing") == "ffill":
        df = df.ffill()
    df = df.dropna(subset=[target]).reset_index(drop=True)
    stages["relleno"] = df

    features = feature_columns(df, dcfg["features"], time_col)
    complete = df[features].notna().all(axis=1)
    first = int(complete.to_numpy().argmax()) if complete.any() else len(df)
    stages["inicio"] = df.iloc[first:].reset_index(drop=True)
    return stages


def missing_by_year(df: pd.DataFrame, time_col: str) -> pd.DataFrame:
    """Fracción de valores vacíos por año (filas) y columna: el mapa de huecos."""
    values = df.drop(columns=[time_col]).isna()
    return values.groupby(pd.to_datetime(df[time_col]).dt.year).mean()


def input_stages(prep: Preprocessor, df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Cada entrada de la red en sus cuatro formas, con la fecha como índice.

    valor         la columna tal cual (las derivadas, como la volatilidad, no tienen)
    transformada  rendimiento diario, diferencia o log1p según data.inputs
    estandarizada (x - media) / desviación, con las de train
    recortada     lo que entra en la red: estandarizada y limitada a ±clip
    """
    index = pd.to_datetime(df[prep.time_column]).rename("fecha")
    raw = df[prep.features].to_numpy(np.float64)
    x = prep._inputs(raw)
    z = (x - prep.x_mean) / prep.x_scale
    clipped = np.clip(z, -prep.clip, prep.clip) if prep.clip else z
    return {
        "valor": pd.DataFrame(raw, index=index, columns=prep.features),
        "transformada": pd.DataFrame(x, index=index, columns=prep.inputs),
        "estandarizada": pd.DataFrame(z, index=index, columns=prep.inputs),
        "recortada": pd.DataFrame(clipped, index=index, columns=prep.inputs),
    }


def window_at(prep: Preprocessor, df: pd.DataFrame, date) -> dict:
    """La predicción que se hace el día `date` (o el último día con dato anterior).

    origin  día del pronóstico: última fila de la ventana y último valor conocido (y_last)
    X       la ventana (window × entradas) ya estandarizada, con sus fechas
    target  día que se predice (origin + horizon filas) y su valor real; None si aún no existe
    y       lo que tiene que acertar la red: el rendimiento a horizon filas, sin estandarizar
    """
    dates = pd.to_datetime(df[prep.time_column]).reset_index(drop=True)
    i = int(dates.searchsorted(pd.Timestamp(date), side="right")) - 1
    first = prep.warmup + prep.window - 1
    if i < first:
        raise ValueError(f"Hacen falta {first + 1} filas hasta {date}; hay {i + 1}")
    x = prep.scale_features(prep._inputs(df[prep.features].to_numpy(np.float64)))
    rows = slice(i - prep.window + 1, i + 1)
    level = df[prep.target].to_numpy(np.float64)
    j = i + prep.horizon
    known = j < len(df)
    out = {
        "origin": dates[i],
        "y_last": float(level[i]),
        "X": pd.DataFrame(x[rows], index=dates[rows].rename("fecha"), columns=prep.inputs),
        "target": dates[j] if known else None,
        "y_true": float(level[j]) if known else None,
        "y": None,
    }
    if known and prep.target_mode != "level":
        out["y"] = float(prep._model_target(level)[j])
    return out


# ── Validación ─────────────────────────────────────────────
def fold_table(cfg: dict, dev: pd.DataFrame, horizon: int | None = None) -> pd.DataFrame:
    """Una fila por pliegue de `make cv` y otra, «final», para `make train` (evalúa en test).

    Tramos, en filas de `dev` (train + val) y en fechas: ajuste (ajusta los pesos), parada
    (decide la época) y evaluación. Entre ellos quedan `horizon` filas de purga sin usar."""
    h = int(horizon or cfg["data"]["horizon"])
    cv = cfg["cv"]
    dates = pd.to_datetime(dev[cfg["data"]["time_column"]]).reset_index(drop=True)
    n = len(dev)
    bounds = [
        *enumerate(fold_boundaries(n, int(cv["folds"]), int(cv["block"])), 1),
        ("final", (n, n)),
    ]
    rows = []
    for name, (start, end) in bounds:
        fit_end, stop_start, stop_end = training_bounds(start, h, int(cv["holdout"]))
        rows.append(
            {
                "pliegue": name,
                "ajuste_desde": dates[0],
                "ajuste_hasta": dates[fit_end - 1],
                "parada_desde": dates[stop_start],
                "parada_hasta": dates[stop_end - 1],
                "eval_desde": dates[start] if start < n else pd.NaT,
                "eval_hasta": dates[end - 1] if start < n else pd.NaT,
                "filas_ajuste": fit_end,
                "filas_parada": stop_end - stop_start,
                "filas_eval": end - start,
                "filas_purga": (stop_start - fit_end) + (start - stop_end),
            }
        )
    return pd.DataFrame(rows).set_index("pliegue")


# ── Runs ───────────────────────────────────────────────────
def _read_json(path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def parse_run_name(name: str) -> dict:
    """Nombre de un run de la rejilla o final → prefijo, celda, horizonte y, si los lleva,
    tamaño oculto, capas, dropout y tasa de aprendizaje. {} si no sigue ese patrón."""
    m = _NAME.match(name)
    if not m:
        return {}
    out = {"prefix": m["prefix"], "cell": m["cell"], "horizon": int(m["horizon"])}
    if m["hidden"]:
        out |= {
            "hidden_size": int(m["hidden"]),
            "num_layers": int(m["layers"]),
            "dropout": float(m["dropout"].replace("-", ".")),
            "learning_rate": float(m["lr"].replace("-", ".")),
        }
    return out


def runs_table(prefix: str | None = None) -> pd.DataFrame:
    """Una fila por run terminado: configuración (del config.yaml guardado en el run) y las
    métricas que no son de un pliegue (cv_*, test_*, stop_*, n_params…). `prefix` filtra por
    el comienzo del nombre: g1 (rejilla), g1s7, g1s123 (semillas) o final."""
    rows = []
    for meta_path in sorted(RUNS_DIR.glob("*/meta.json")):
        meta = _read_json(meta_path)
        name = meta.get("name", "")
        parsed = parse_run_name(name)
        if meta.get("status") != "finished" or (prefix and parsed.get("prefix") != prefix):
            continue
        cfg = yaml.safe_load((meta_path.parent / "config.yaml").read_text(encoding="utf-8"))
        metrics = _read_json(meta_path.parent / "metrics.json")
        rows.append(
            {
                "run_id": meta["run_id"],
                "name": name,
                "prefix": parsed.get("prefix"),
                "cell": cfg["model"]["cell"],
                "horizon": int(cfg["data"]["horizon"]),
                "hidden_size": int(cfg["model"]["hidden_size"]),
                "num_layers": int(cfg["model"]["num_layers"]),
                "dropout": float(cfg["model"].get("dropout", 0.0)),
                "learning_rate": float(cfg["train"]["learning_rate"]),
                "seed": int(cfg.get("seed", 42)),
                **{k: v for k, v in metrics.items() if not _FOLD.match(k)},
            }
        )
    return pd.DataFrame(rows)


CONFIG_KEYS = ["cell", "horizon", "hidden_size", "num_layers", "dropout", "learning_rate"]


def same_config(runs: pd.DataFrame, row) -> pd.DataFrame:
    """Los runs de `runs` con la misma red, horizonte e hiperparámetros que `row` (otra semilla,
    el run de make cv de un modelo final…)."""
    mask = np.logical_and.reduce(
        [np.isclose(runs[k], row[k]) if k != "cell" else runs[k] == row[k] for k in CONFIG_KEYS]
    )
    return runs[mask]


def fold_metrics(run_id: str) -> pd.DataFrame:
    """Métricas finales de cada pliegue de un run de make cv (filas: pliegue)."""
    metrics = _read_json(run_paths(run_id)["run"] / "metrics.json")
    found = [(int(m[1]), m[2], v) for k, v in metrics.items() if (m := _FOLD.match(k))]
    table = pd.DataFrame(found, columns=["pliegue", "metrica", "valor"])
    return table.pivot(index="pliegue", columns="metrica", values="valor")


def loss_history(run_id: str) -> pd.DataFrame:
    """Pérdida de train y de parada por época: columnas pliegue (0 = modelo final), epoca,
    train_loss y val_loss. Sale de runs/<id>/metrics.jsonl."""
    path = run_paths(run_id)["run"] / "metrics.jsonl"
    rows = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        if "step" not in rec:
            continue
        for key, value in rec.items():
            m = _FOLD.match(key)
            fold, metric = (int(m[1]), m[2]) if m else (0, key)
            if metric in ("train_loss", "val_loss"):
                rows.setdefault((fold, rec["step"]), {})[metric] = value
    out = pd.DataFrame([{"pliegue": f, "epoca": s, **v} for (f, s), v in sorted(rows.items())])
    return out


def _predictions(run_id: str, filename: str) -> pd.DataFrame:
    path = run_paths(run_id)["artifacts"] / filename
    if not path.exists():
        raise FileNotFoundError(f"No existe {path}")
    return pd.read_csv(path, parse_dates=["time"])


def cv_predictions(run_id: str) -> pd.DataFrame:
    """Predicciones de los bloques de make cv: time, y_true, y_pred, y_lo, y_hi, y_baseline, fold.
    El intervalo es el de la red, sin la corrección conforme."""
    return _predictions(run_id, "cv_predictions.csv")


def test_predictions(run_id: str) -> pd.DataFrame:
    """Predicciones en test de un modelo final (make evaluate SPLIT=test), ya calibradas."""
    return _predictions(run_id, "predictions_test.csv")


test_predictions.__test__ = False  # no es un test de pytest


def skill_by(pred: pd.DataFrame, by: str = "year") -> pd.DataFrame:
    """Error y cobertura por grupo (año o pliegue) de un archivo de predicciones.

    skill_rmse = 1 - RMSE de la red / RMSE de la persistencia; > 0 = la red es mejor."""
    key = pred["time"].dt.year.rename("año") if by == "year" else pred[by]
    rows = {}
    for group, g in pred.groupby(key):
        rmse = float(np.sqrt(np.mean((g["y_true"] - g["y_pred"]) ** 2)))
        base = float(np.sqrt(np.mean((g["y_true"] - g["y_baseline"]) ** 2)))
        rows[group] = {
            "n": len(g),
            "rmse": rmse,
            "baseline_rmse": base,
            "skill_rmse": 1 - rmse / base,
            "coverage": float(((g["y_lo"] <= g["y_true"]) & (g["y_true"] <= g["y_hi"])).mean()),
        }
    return pd.DataFrame.from_dict(rows, orient="index")


def significance(prefix: str = "final") -> pd.DataFrame:
    """Diebold-Mariano (con la corrección de Harvey, Leybourne y Newbold) de cada modelo `prefix`
    frente a la persistencia, sobre sus predicciones en test. Una fila por horizonte.

    dm_* con el error cuadrático (el del RMSE) y dm_abs_* con el absoluto (el del MAE).
    stat < 0: la red tiene menos error; p_value: probabilidad de una diferencia al menos así
    de grande si las dos tuvieran el mismo error esperado. n_independent = n / h, aproximado."""
    rows = []
    for _, run in runs_table(prefix).sort_values("horizon").iterrows():
        pred = test_predictions(run["run_id"])
        h = int(run["horizon"])
        e_model, e_ref = pred["y_true"] - pred["y_pred"], pred["y_true"] - pred["y_baseline"]
        sq = diebold_mariano(e_model, e_ref, h, power=2)
        ab = diebold_mariano(e_model, e_ref, h, power=1)
        rows.append(
            {
                "horizon": h,
                "cell": run["cell"],
                "n": sq["n"],
                "n_independent": sq["n"] // h,
                "dm_stat": sq["stat"],
                "dm_p_value": sq["p_value"],
                "dm_kernel": sq["kernel"],
                "dm_abs_stat": ab["stat"],
                "dm_abs_p_value": ab["p_value"],
                "dm_abs_kernel": ab["kernel"],
                "run_id": run["run_id"],
            }
        )
    return pd.DataFrame(rows)


def futures_naive(
    cfg: dict, dev: pd.DataFrame | None = None, prefix: str = "final"
) -> pd.DataFrame:
    """Referencia «ingenuo con futuros» en los bloques de validación de `make cv` (test fuera).

    Si el spot se publica con L días hábiles de retraso, al hacer de verdad el pronóstico ya se
    conoce el futuro F hasta t + L. La regla actualiza el último spot publicado con ese
    movimiento: P[t]·F[t+L]/F[t], con L limitado a h. L = 0 es la persistencia.
    Usa las mismas filas que el run de make cv (rejilla g1, semilla 42) de cada modelo `prefix`.
    Una fila por horizonte: skill_lag<L> = 1 − RMSE de la regla / RMSE de la persistencia, y
    skill_net, lo mismo para la red de ese run (mediana, sin calibrar), sobre las mismas filas."""
    dcfg, ncfg = cfg["data"], cfg["cv"]["naive_futures"]
    dev = load_train_val() if dev is None else dev
    position = pd.Series(range(len(dev)), index=pd.to_datetime(dev[dcfg["time_column"]]))
    spot = dev[dcfg["target"]].to_numpy(np.float64)
    fut = dev[ncfg["column"]].to_numpy(np.float64)
    grid = runs_table("g1")
    grid = grid[grid["seed"] == 42]

    def rmse(err) -> float:
        return float(np.sqrt(np.mean(np.square(err))))

    rows = []
    for _, run in runs_table(prefix).sort_values("horizon").iterrows():
        h = int(run["horizon"])
        cv_run = same_config(grid, run).iloc[0]["run_id"]
        pred = cv_predictions(cv_run)
        origin = position.loc[pred["time"]].to_numpy() - h
        if not np.allclose(spot[origin], pred["y_baseline"]):
            raise ValueError(f"{cv_run}: y_baseline no coincide con {dcfg['target']} en t − h")
        if np.isnan(fut[origin]).any():
            raise ValueError(f"{ncfg['column']} vacío en algún origen de {cv_run}")
        y = pred["y_true"].to_numpy()
        base = rmse(y - spot[origin])
        row = {
            "horizon": h,
            "cell": run["cell"],
            "n": len(pred),
            "baseline_rmse": base,
            "skill_net": 1 - rmse(y - pred["y_pred"]) / base,
        }
        for lag in ncfg["lags"]:
            k = min(int(lag), h)
            guess = spot[origin] * fut[origin + k] / fut[origin]
            row[f"skill_lag{lag}"] = 1 - rmse(y - guess) / base
        row["cv_run"] = cv_run
        rows.append(row)
    return pd.DataFrame(rows)


# ── Las celdas, paso a paso ────────────────────────────────
def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def cell_weights(rnn) -> dict[str, np.ndarray]:
    """Pesos de la primera capa de un nn.RNN, nn.LSTM o nn.GRU de PyTorch, en NumPy."""
    names = ("weight_ih_l0", "weight_hh_l0", "bias_ih_l0", "bias_hh_l0")
    return {n[:-3]: getattr(rnn, n).detach().cpu().numpy().astype(np.float64) for n in names}


def cell_trace(cell: str, w: dict[str, np.ndarray], x: np.ndarray) -> dict[str, np.ndarray]:
    """Una capa recurrente aplicada a una ventana x (pasos × entradas), con las mismas
    ecuaciones que PyTorch. Devuelve el estado oculto `h` de cada paso (pasos × oculto), las
    puertas de GATES[cell] y, en la LSTM, la memoria `c`.

    rnn   h = tanh(W·x + U·h)
    lstm  i, f, o = σ(…) · g = tanh(…) · c = f·c + i·g · h = o·tanh(c)
    gru   r, z = σ(…) · n = tanh(W·x + r·(U·h)) · h = (1−z)·n + z·h
    """
    if cell not in GATES:
        raise ValueError(f"cell debe ser rnn, lstm o gru, no {cell}")
    wi, wh, bi, bh = w["weight_ih"], w["weight_hh"], w["bias_ih"], w["bias_hh"]
    size = wh.shape[1]
    h, c = np.zeros(size), np.zeros(size)
    trace: dict[str, list] = {
        k: [] for k in ("h", *GATES[cell], *(["c"] if cell == "lstm" else []))
    }
    for step in np.asarray(x, np.float64):
        a, b = wi @ step + bi, wh @ h + bh
        if cell == "rnn":
            h = np.tanh(a + b)
        elif cell == "lstm":
            i, f, g, o = np.split(a + b, 4)
            i, f, g, o = _sigmoid(i), _sigmoid(f), np.tanh(g), _sigmoid(o)
            c = f * c + i * g
            h = o * np.tanh(c)
            for k, v in zip("ifgoc", (i, f, g, o, c), strict=True):
                trace[k].append(v)
        else:
            (ar, az, an), (br, bz, bn) = np.split(a, 3), np.split(b, 3)
            r, z = _sigmoid(ar + br), _sigmoid(az + bz)
            n = np.tanh(an + r * bn)
            h = (1 - z) * n + z * h
            for k, v in zip("rzn", (r, z, n), strict=True):
                trace[k].append(v)
        trace["h"].append(h)
    return {k: np.array(v) for k, v in trace.items()}


def count_params(cell: str, n_inputs: int, hidden: int, layers: int = 1, n_outputs: int = 3) -> int:
    """Parámetros de RNNRegressor: cada capa tiene `puertas` bloques de
    hidden·(entradas + hidden + 2) y la capa lineal final, n_outputs·(hidden + 1)."""
    blocks = max(len(GATES[cell]), 1)
    total = n_outputs * (hidden + 1)
    for layer in range(layers):
        size_in = n_inputs if layer == 0 else hidden
        total += blocks * hidden * (size_in + hidden + 2)
    return total


# ── Página explicativa (make export-explain) ───────────────
def preprocessor_from_manifest(cfg: dict, entry: dict) -> Preprocessor:
    """El preprocesado de un modelo exportado, rehecho con los parámetros de su entrada en
    web/public/model/manifest.json: lo mismo que replica web/src/model.ts."""
    run_cfg = copy.deepcopy(cfg)
    run_cfg["data"] |= {k: entry[k] for k in ("window", "horizon", "target_mode", "target")}
    prep = Preprocessor(run_cfg)
    prep.features, prep.transforms = list(entry["features"]), list(entry["transforms"])
    prep.inputs = list(entry["inputs"])
    prep.floor = {f: v for f, v in zip(entry["features"], entry["floor"], strict=True) if v}
    prep.volatility, prep.clip = entry["volatility"], entry["clip"]
    prep.x_mean, prep.x_scale = np.asarray(entry["x_mean"]), np.asarray(entry["x_scale"])
    prep.y_mean, prep.y_scale = float(entry["y_mean"]), float(entry["y_scale"])
    return prep


def onnx_session(path: Path, hidden: bool = False):
    """Sesión de ONNX Runtime de una red exportada. Con hidden=True añade como segunda salida
    el estado oculto de la primera capa en cada paso de la ventana. La RNN simple se exporta
    desenrollada (un tanh por paso): su primera capa es la primera concatenación de tanh."""
    import onnx
    import onnxruntime as ort

    model = onnx.load(path)
    if hidden:
        graph = model.graph
        recurrent = [n for n in graph.node if n.op_type in ("GRU", "LSTM", "RNN")]
        if recurrent:
            name = recurrent[0].output[0]
        else:
            name = next(
                n.output[0]
                for n in graph.node
                if n.op_type == "Concat" and n.input and all(i.startswith("tanh") for i in n.input)
            )
        graph.output.append(onnx.helper.make_tensor_value_info(name, onnx.TensorProto.FLOAT, None))
    return ort.InferenceSession(model.SerializeToString())


def state_path(states: np.ndarray, dims: int = 3) -> dict:
    """Recorrido del estado oculto (pasos × unidades), empezando en el estado inicial (ceros),
    proyectado en sus `dims` direcciones de mayor variación (componentes principales) y
    escalado a [-1, 1]. explained: fracción de la variación que recogen esas direcciones.
    change: cuánto cambia el estado cada día (raíz del cambio cuadrático medio por unidad)."""
    h = np.vstack([np.zeros((1, states.shape[1])), states])
    centered = h - h.mean(axis=0)
    _, s, vt = np.linalg.svd(centered, full_matrices=False)
    xyz = centered @ vt[:dims].T
    change = np.sqrt(np.mean(np.diff(h, axis=0) ** 2, axis=1))
    return {
        "xyz": (xyz / np.abs(xyz).max()).round(4).tolist(),
        "explained": float((s[:dims] ** 2).sum() / (s**2).sum()),
        "change": change.round(5).tolist(),
    }


def cell_paths(cfg: dict, manifest: dict, market: dict) -> tuple[list[dict], dict]:
    """Cada modelo final sobre la última ventana de market.json (la que usa Sonda): recorrido
    de su estado oculto y tamaño. Devuelve también la ventana del primer horizonte tal como la
    ve la red (window × entradas, estandarizada y recortada). Antes comprueba, con los
    ejemplos de paridad de make export-web, que el preprocesado rehecho da la misma salida."""
    from .conformal import calibrate_quantiles

    examples = json.loads((WEB_MODEL_DIR / "examples.json").read_text(encoding="utf-8"))
    finals = runs_table("final").set_index("run_id")
    rows = np.asarray(market["rows"]["values"], np.float64)
    paths, window = [], None
    for entry in sorted(manifest["models"], key=lambda e: e["horizon"]):
        if entry["features"] != market["features"]:
            raise ValueError(f"h={entry['horizon']}: features distintas en manifest y market")
        prep = preprocessor_from_manifest(cfg, entry)
        session = onnx_session(WEB_MODEL_DIR / entry["model_file"], hidden=True)
        name = session.get_inputs()[0].name
        for ex in examples[str(entry["horizon"])]:
            raw = session.run(None, {name: prep.window_from_rows(np.asarray(ex["rows"]))[None]})[0]
            last = np.array([ex["rows"][-1][entry["target_index"]]])
            pred = calibrate_quantiles(
                prep.inverse_target(raw, last), entry["quantiles"], entry["conformal"]
            )
            if not np.allclose(pred[0], ex["expected"], rtol=1e-4):
                raise ValueError(f"h={entry['horizon']}: el preprocesado rehecho no reproduce")
        x = prep.window_from_rows(rows)
        states = session.run(None, {name: x[None]})[1].reshape(len(x), -1)
        run = finals.loc[entry["run_id"]]
        layers, hidden = int(run["num_layers"]), int(run["hidden_size"])
        paths.append(
            {
                "horizon": entry["horizon"],
                "cell": entry["cell"],
                "hidden": hidden,
                "layers": layers,
                "params": count_params(entry["cell"], len(entry["inputs"]), hidden, layers),
                **state_path(states),
            }
        )
        if window is None:
            window = {
                "horizon": entry["horizon"],
                "t": market["rows"]["t"][-len(x) :],
                "inputs": entry["inputs"],
                "price": rows[-len(x) :, entry["target_index"]].round(2).tolist(),
                "x": x.round(3).tolist(),
            }
    return paths, window


def cell_comparison(cfg: dict) -> pd.DataFrame:
    """Validación (make cv) de las tres celdas por horizonte: la mejor configuración de la
    rejilla (menor cv_<sweep.select_by> con semilla 42) y su mejora de RMSE frente a la
    persistencia (cv_skill_vs_baseline) en todas las semillas con esa configuración."""
    prefix, key = cfg["sweep"]["prefix"], f"cv_{cfg['sweep']['select_by']}"
    runs = runs_table()
    runs = runs[runs["prefix"].fillna("").str.startswith(prefix)]
    grid = runs[runs["prefix"] == prefix]
    chosen = set(zip(runs_table("final")["horizon"], runs_table("final")["cell"], strict=True))
    rows = []
    for (h, cell), group in grid.groupby(["horizon", "cell"]):
        same = same_config(runs, group.loc[group[key].idxmin()])
        skill = same["cv_skill_vs_baseline"]
        rows.append(
            {
                "horizon": int(h),
                "cell": cell,
                "chosen": (h, cell) in chosen,
                "seeds": len(same),
                "skill": skill.mean(),
                "skill_min": skill.min(),
                "skill_max": skill.max(),
            }
        )
    return pd.DataFrame(rows)


def test_summary(prefix: str = "final") -> list[dict]:
    """Por modelo final: sus predicciones en test (fecha objetivo, real, mediana, intervalo y
    persistencia, en $), las métricas de eval_test.json y el error y la cobertura por año."""
    out = []
    for _, run in runs_table(prefix).sort_values("horizon").iterrows():
        pred = test_predictions(run["run_id"])
        metrics = _read_json(run_paths(run["run_id"])["run"] / "eval_test.json")["metrics"]
        by_year = skill_by(pred).rename_axis("year").reset_index()
        out.append(
            {
                "horizon": int(run["horizon"]),
                "cell": run["cell"],
                "t": pred["time"].dt.strftime("%Y-%m-%d").tolist(),
                **{
                    k: pred[c].round(2).tolist()
                    for k, c in (
                        ("real", "y_true"),
                        ("pred", "y_pred"),
                        ("lo", "y_lo"),
                        ("hi", "y_hi"),
                        ("base", "y_baseline"),
                    )
                },
                "metrics": {k.removeprefix("test_"): v for k, v in metrics.items()},
                "by_year": _records(by_year),
            }
        )
    return out


def _records(df: pd.DataFrame) -> list[dict]:
    return json.loads(df.to_json(orient="records", date_format="iso", double_precision=5))


def explain_data(cfg: dict) -> dict:
    """Todo lo que dibuja la página explicativa (web/explica.html), salvo el histórico y los
    sucesos, que lee de market.json. Solo cifras ya guardadas: no entrena ni evalúa."""
    manifest = json.loads((WEB_MODEL_DIR / "manifest.json").read_text(encoding="utf-8"))
    market = json.loads((WEB_DATA_DIR / "market.json").read_text(encoding="utf-8"))
    ranges = json.loads(SPLITS_MANIFEST.read_text(encoding="utf-8"))["ranges"]
    dev = load_train_val()
    cells, window = cell_paths(cfg, manifest, market)
    horizons = sorted(m["horizon"] for m in manifest["models"])
    return {
        "asof": market["ts"],
        "splits": {k: [v[0][:10], v[1][:10]] for k, v in ranges.items()},
        "folds": {str(h): _records(fold_table(cfg, dev, h)) for h in horizons},
        "window": window,
        "cells": cells,
        "cv": _records(cell_comparison(cfg)),
        "test": test_summary(),
        "dm": _records(significance().drop(columns="run_id")),
        "futures": _records(futures_naive(cfg, dev).drop(columns="cv_run")),
    }


if __name__ == "__main__":
    import argparse

    from .config import load_config

    parser = argparse.ArgumentParser(description="Vistas de explore.py en la terminal")
    parser.add_argument("view", choices=["dm", "naive-futures"])
    view = parser.parse_args().view
    table = (
        significance().drop(columns="run_id")
        if view == "dm"
        else futures_naive(load_config()).drop(columns="cv_run")
    )
    with pd.option_context("display.width", 200, "display.max_columns", None):
        print(table.to_string(index=False, float_format="%.4g"))
