"""Comprobaciones del preprocesado con datos sintéticos (no necesita data/)."""

import numpy as np
import pandas as pd
import pytest

from oil_rnn.config import load_config
from oil_rnn.data import CONTEXT_COLUMN
from oil_rnn.features import Preprocessor


def _cfg(window=5, horizon=2, mode="change", inputs=None):
    inputs = inputs or ["data.inputs.transform=level", "data.inputs.volatility=null"]
    return load_config(
        overrides=[
            "data.target=y",
            "data.time_column=t",
            "data.features=all",
            f"data.window={window}",
            f"data.horizon={horizon}",
            f"data.target_mode={mode}",
            *inputs,
        ]
    )


def _returns_cfg(volatility="null", floor="{}", window=5, horizon=2):
    return _cfg(
        window=window,
        horizon=horizon,
        mode="log_return",
        inputs=[
            "data.inputs.transform=returns",
            "data.inputs.diff=[x]",
            "data.inputs.log1p_diff=[]",
            f"data.inputs.floor={floor}",
            f"data.inputs.volatility={volatility}",
        ],
    )


def _prices(n=60, seed=0):
    rng = np.random.default_rng(seed)
    return pd.DataFrame(
        {
            "t": pd.date_range("2020-01-01", periods=n),
            "y": 50 * np.exp(np.cumsum(rng.normal(0, 0.02, n))),
            "x": rng.normal(0, 1, n),  # admite negativos: entra en diferencias
        }
    )


def test_rendimientos_sin_futuro():
    df = _prices()
    prep = Preprocessor(_returns_cfg(window=5, horizon=2)).fit(df)
    w = prep.windows(df)
    assert prep.warmup == 1 and prep.transforms == ["log_diff", "diff"]
    assert len(w["row"]) == len(df) - (1 + 5 - 1 + 2)
    # Última fila de cada ventana = cambio diario en t - horizon, nunca posterior.
    t = w["row"]
    y, x = df["y"].to_numpy(), df["x"].to_numpy()
    last = w["X"][:, -1, :] * prep.x_scale + prep.x_mean
    np.testing.assert_allclose(last[:, 0], np.log(y[t - 2] / y[t - 3]), atol=1e-5)
    np.testing.assert_allclose(last[:, 1], x[t - 2] - x[t - 3], atol=1e-5)


def test_volatilidad_solo_usa_el_pasado():
    df = _prices()
    prep = Preprocessor(_returns_cfg(volatility=4, window=5, horizon=2)).fit(df)
    w = prep.windows(df)
    assert prep.inputs == ["y", "x", "y_vol4"] and prep.warmup == 4
    ret = np.log(df["y"]).diff()
    expected = ret.rolling(4).std().to_numpy()[w["row"] - 2]
    vol = w["X"][:, -1, 2] * prep.x_scale[2] + prep.x_mean[2]
    np.testing.assert_allclose(vol, expected, atol=1e-5)
    # Cambiar el futuro (filas > t - horizon) no altera la ventana de t.
    later = df.copy()
    later.loc[later.index[-1], ["y", "x"]] = [999.0, 999.0]
    np.testing.assert_array_equal(prep.windows(later)["X"][:-1], w["X"][:-1])


def test_suelo_para_valores_negativos():
    df = _prices().assign(z=lambda d: d["y"])
    df.loc[30, "z"] = -37.0
    cfg = _returns_cfg()
    cfg["data"]["features"] = ["y", "x", "z"]
    with pytest.raises(ValueError, match="floor"):
        Preprocessor(cfg).fit(df)
    cfg["data"]["inputs"]["floor"] = {"z": 1.0}
    w = Preprocessor(cfg).fit(df).windows(df)
    assert np.isfinite(w["X"]).all()


def test_recorte_de_entradas_estandarizadas():
    df = _prices()
    df.loc[30, "x"] = 1e3  # salto extremo en diferencias
    cfg = _returns_cfg()
    cfg["data"]["inputs"]["clip"] = 5
    X = Preprocessor(cfg).fit(df).windows(df)["X"]
    assert np.abs(X).max() == pytest.approx(5.0)


def test_ventana_desde_filas_igual_que_windows():
    df = _prices()
    prep = Preprocessor(_returns_cfg(volatility=4)).fit(df)
    rows = df[prep.features].to_numpy()[: len(df) - 2]  # termina en t - horizon de la última
    np.testing.assert_allclose(prep.window_from_rows(rows), prep.windows(df)["X"][-1], atol=1e-6)


def _series(n=40):
    return pd.DataFrame(
        {
            "t": pd.date_range("2020-01-01", periods=n),
            "y": np.arange(n, dtype=float),
            "x": np.arange(n, dtype=float) * 2,
        }
    )


def test_ventanas_alineadas_sin_futuro():
    df = _series()
    prep = Preprocessor(_cfg(window=5, horizon=2)).fit(df)
    w = prep.windows(df)
    first = 5 - 1 + 2
    assert w["X"].shape == (len(df) - first, 5, 2)
    # La última fila de cada ventana es t - horizon: el valor que se predice nunca entra.
    i = prep.features.index("y")
    x_last = w["X"][:, -1, i] * prep.x_scale[i] + prep.x_mean[i]
    np.testing.assert_allclose(x_last, w["y_true"] - 2, atol=1e-4)
    np.testing.assert_allclose(w["y_last"], w["y_true"] - 2)


def test_modo_cambio_reconstruye_el_nivel():
    df = _series().assign(y=lambda d: d["y"] + 1)  # log_return exige un target positivo
    for mode in ("level", "change", "log_return"):
        prep = Preprocessor(_cfg(mode=mode)).fit(df)
        w = prep.windows(df)
        np.testing.assert_allclose(prep.inverse_target(w["y"], w["y_last"]), w["y_true"], atol=1e-4)


def test_filas_de_contexto_no_se_predicen():
    df = _series().assign(**{CONTEXT_COLUMN: False})
    df.loc[:9, CONTEXT_COLUMN] = True
    prep = Preprocessor(_cfg()).fit(df)
    w = prep.windows(df)
    assert (w["row"] >= 10).all()


def test_pendiente_para_con_mensaje():
    with pytest.raises(ValueError, match="PENDIENTE"):
        Preprocessor(load_config(overrides=["data.target=PENDIENTE"]))
