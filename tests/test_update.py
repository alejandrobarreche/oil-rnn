"""make update: market.json con datos nuevos, sin descargar en los tests."""

import numpy as np
import pandas as pd
import pytest

from oil_rnn.data import clean
from oil_rnn.update import check_update, market, rows_needed


def _cfg() -> dict:
    return {
        "data": {
            "target": "y",
            "features": ["y", "x"],
            "time_column": "date",
            "fill_missing": "ffill",
        },
        "web": {"events": [{"start": "2024-01-01", "end": "2024-01-31", "kind": "max"}]},
    }


def _raw(n: int = 40) -> pd.DataFrame:
    dates = pd.bdate_range("2024-01-01", periods=n)
    y = np.linspace(70.0, 80.0, n)
    x = np.arange(n, dtype=float)
    x[5] = np.nan  # festivo de otro mercado: lo rellena el ffill
    y[-2:] = np.nan  # la fuente aún no ha publicado los dos últimos días del target
    return pd.DataFrame({"date": dates, "y": y, "x": x})


def _manifest(window: int = 10) -> dict:
    return {"models": [{"horizon": 5, "features": ["y", "x"], "window": window, "warmup": 1}]}


def test_corta_en_el_ultimo_dato_real_y_rellena_hacia_atras_nunca():
    df, info = clean(_raw(), _cfg())
    assert info["rows_after_last_target"] == 2
    assert len(df) == 38
    assert df.loc[5, "x"] == 4.0  # repite el valor anterior


def test_market_lleva_las_filas_que_pide_el_modelo():
    df, _ = clean(_raw(), _cfg())
    out = market(_cfg(), df, rows_needed(_manifest()), status="live")
    assert out["status"] == "live"
    assert out["ts"] == str(df["date"].iloc[-1])[:10]
    assert len(out["rows"]["values"]) == 11
    assert out["rows"]["t"][-1] == out["ts"]
    assert out["events"][0]["price"] == df.set_index("date")["y"]["2024-01"].max()
    check_update(out, None, _manifest())


def test_rechaza_una_descarga_mas_antigua_que_la_publicada():
    df, _ = clean(_raw(), _cfg())
    out = market(_cfg(), df, 11, status="live")
    with pytest.raises(ValueError, match="antes que"):
        check_update(out, {"ts": "2099-01-01"}, _manifest())


def test_rechaza_features_distintas_a_las_del_modelo():
    df, _ = clean(_raw(), _cfg())
    out = market(_cfg(), df, 11, status="live")
    manifest = _manifest()
    manifest["models"][0]["features"] = ["x", "y"]
    with pytest.raises(ValueError, match="features"):
        check_update(out, None, manifest)


def test_rechaza_si_faltan_filas():
    df, _ = clean(_raw(), _cfg())
    out = market(_cfg(), df, 11, status="live")
    with pytest.raises(ValueError, match="necesita"):
        check_update(out, None, _manifest(window=50))
