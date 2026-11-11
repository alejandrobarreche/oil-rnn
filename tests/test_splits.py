"""Comprobaciones de los splits con datos sintéticos (no necesita data/)."""

import numpy as np
import pandas as pd

from oil_rnn.config import load_config
from oil_rnn.data import _split


def _cfg(features="all"):
    return load_config(
        overrides=[
            "data.target=y",
            "data.time_column=t",
            f"data.features={features}",
            "data.fill_missing=ffill",
            "data.val_size=0.2",
            "data.test_size=0.2",
        ]
    )


def _series(n=100, late_start=10):
    """Serie con una feature 'x' que empieza tarde y una 'z' fuera de las features."""
    x = np.arange(n, dtype=float)
    x[:late_start] = np.nan
    t = pd.date_range("2020-01-01", periods=n)
    return pd.DataFrame({"t": t, "y": np.arange(n, dtype=float), "x": x, "z": np.full(n, np.nan)})


def test_recorta_el_comienzo_incompleto_antes_de_dividir():
    parts, info = _split(_series(late_start=10), _cfg(features="[y,x]"))
    assert info["rows_dropped_incomplete_start"] == 10
    assert parts["train"]["x"].notna().all()
    # Los porcentajes se calculan sobre las 90 filas útiles, no sobre las 100 originales.
    assert [len(parts[k]) for k in ("train", "val", "test")] == [54, 18, 18]


def test_splits_cronologicos_sin_solapes():
    parts, _ = _split(_series(), _cfg(features="[y,x]"))
    train, val, test = parts["train"]["t"], parts["val"]["t"], parts["test"]["t"]
    assert train.max() < val.min() and val.max() < test.min()
    assert test.max() == pd.Timestamp("2020-01-01") + pd.Timedelta(days=99)
