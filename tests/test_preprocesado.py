"""Comprobaciones del preprocesado con datos sintéticos (no necesita data/)."""

import numpy as np
import pandas as pd
import pytest

from oil_rnn.config import load_config
from oil_rnn.data import CONTEXT_COLUMN
from oil_rnn.features import Preprocessor


def _cfg(window=5, horizon=2, mode="change"):
    return load_config(
        overrides=[
            "data.target=y",
            "data.time_column=t",
            "data.features=all",
            f"data.window={window}",
            f"data.horizon={horizon}",
            f"data.target_mode={mode}",
        ]
    )


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
