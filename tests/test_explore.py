"""Comprobaciones de las vistas de explore.py con datos sintéticos (no necesita data/)."""

import numpy as np
import pandas as pd
import pytest
import torch

from oil_rnn import explore
from oil_rnn.config import load_config
from oil_rnn.data import _split, training_bounds
from oil_rnn.features import Preprocessor
from oil_rnn.model import RNNRegressor


def _cfg(window=5, horizon=2):
    return load_config(
        overrides=[
            "data.target=y",
            "data.time_column=t",
            "data.features=[y,x]",
            "data.fill_missing=ffill",
            "data.val_size=0.2",
            "data.test_size=0.2",
            f"data.window={window}",
            f"data.horizon={horizon}",
            "data.target_mode=log_return",
            "data.inputs.transform=returns",
            "data.inputs.diff=[]",
            "data.inputs.log1p_diff=[]",
            "data.inputs.floor={}",
            "data.inputs.volatility=3",
            "data.inputs.clip=2",
            "cv.folds=2",
            "cv.block=20",
            "cv.holdout=10",
        ]
    )


def _raw(n=120, late_start=10, seed=0):
    """Precios positivos con una feature que empieza tarde, un hueco interior y el final del
    target sin publicar."""
    rng = np.random.default_rng(seed)
    y = 50 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
    x = 20 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
    x[:late_start] = np.nan
    x[40] = np.nan
    y[-3:] = np.nan
    return pd.DataFrame({"t": pd.date_range("2020-01-01", periods=n), "y": y, "x": x})


def test_etapas_terminan_en_lo_que_divide_prepare():
    cfg, raw = _cfg(), _raw()
    stages = explore.pipeline_stages(cfg, raw)
    assert list(stages) == list(explore.STAGES)
    assert len(stages["bruto"]) == 120 and len(stages["corte"]) == 117
    assert stages["relleno"]["x"].iloc[40] == stages["relleno"]["x"].iloc[39]  # ffill: el anterior
    parts, info = _split(raw, cfg)
    expected = pd.concat(parts.values()).reset_index(drop=True)
    pd.testing.assert_frame_equal(stages["inicio"], expected)
    assert len(stages["relleno"]) - len(stages["inicio"]) == info["rows_dropped_incomplete_start"]


def test_mapa_de_huecos_por_año():
    table = explore.missing_by_year(_raw(), "t")
    assert table.loc[2020, "x"] == pytest.approx(11 / 120)
    assert table.loc[2020, "y"] == pytest.approx(3 / 120)


def _fitted():
    cfg = _cfg()
    df = explore.pipeline_stages(cfg, _raw())["inicio"]
    return Preprocessor(cfg).fit(df), df


def test_entradas_en_sus_cuatro_formas():
    prep, df = _fitted()
    s = explore.input_stages(prep, df)
    assert list(s["transformada"].columns) == ["y", "x", "y_vol3"]
    expected = np.diff(np.log(df["y"].to_numpy()))
    np.testing.assert_allclose(s["transformada"]["y"].to_numpy()[1:], expected)
    assert s["recortada"].abs().max().max() <= 2 + 1e-9
    inside = s["estandarizada"].abs() <= 2
    pd.testing.assert_frame_equal(s["recortada"][inside], s["estandarizada"][inside])


def test_ventana_de_un_dia_igual_que_las_del_entrenamiento():
    prep, df = _fitted()
    w = prep.windows(df)
    k = 7
    row = int(w["row"][k])  # fila que se predice
    origin = df["t"].iloc[row - prep.horizon]
    one = explore.window_at(prep, df, origin)
    np.testing.assert_allclose(one["X"].to_numpy(), w["X"][k], rtol=1e-6)
    assert one["origin"] == origin and one["target"] == df["t"].iloc[row]
    assert one["X"].index[-1] == origin  # la ventana no pasa del día del pronóstico
    assert one["y_last"] == w["y_last"][k] and one["y_true"] == w["y_true"][k]
    assert one["y"] == pytest.approx(np.log(one["y_true"] / one["y_last"]))


def test_ventana_del_ultimo_dia_no_tiene_objetivo():
    prep, df = _fitted()
    one = explore.window_at(prep, df, df["t"].iloc[-1])
    assert one["target"] is None and one["y_true"] is None and one["y"] is None


@pytest.mark.parametrize("h", [1, 2, 5])
def test_pliegues_coherentes_con_la_purga(h):
    cfg = _cfg()
    dev = explore.pipeline_stages(cfg, _raw())["inicio"].iloc[:90]
    table = explore.fold_table(cfg, dev, horizon=h)
    assert list(table.index) == [1, 2, "final"]
    assert table.loc[2, "eval_hasta"] == dev["t"].iloc[-1]
    assert pd.isna(table.loc["final", "eval_desde"])  # el modelo final se evalúa en test
    for name, start in ((1, 50), (2, 70), ("final", 90)):
        fit_end, stop_start, stop_end = training_bounds(start, h, 10)
        row = table.loc[name]
        assert row["ajuste_hasta"] == dev["t"].iloc[fit_end - 1]
        assert row["parada_desde"] == dev["t"].iloc[stop_start]
        assert row["filas_purga"] == 2 * (h - 1)
        assert row["ajuste_hasta"] < row["parada_desde"] <= row["parada_hasta"]


def test_nombre_de_run():
    parsed = explore.parse_run_name("g1-gru-h63-n128-l2-d0-3-lr0-0001")
    assert parsed == {
        "prefix": "g1",
        "cell": "gru",
        "horizon": 63,
        "hidden_size": 128,
        "num_layers": 2,
        "dropout": 0.3,
        "learning_rate": 0.0001,
    }
    assert explore.parse_run_name("final-rnn-h252") == {
        "prefix": "final",
        "cell": "rnn",
        "horizon": 252,
    }
    dotted = explore.parse_run_name("g1s7-gru-h63-n128-l2-d0.3-lr0.0001")  # nombre en meta.json
    assert dotted == parsed | {"prefix": "g1s7"}
    assert explore.parse_run_name("humo-h5") == {}


def test_error_y_cobertura_por_año():
    pred = pd.DataFrame(
        {
            "time": pd.to_datetime(["2020-01-01", "2020-06-01", "2021-01-01", "2021-06-01"]),
            "y_true": [10.0, 12.0, 10.0, 10.0],
            "y_pred": [10.0, 12.0, 13.0, 13.0],
            "y_lo": [9.0, 9.0, 12.0, 9.0],
            "y_hi": [11.0, 11.0, 14.0, 14.0],
            "y_baseline": [11.0, 11.0, 11.0, 11.0],
        }
    )
    table = explore.skill_by(pred)
    assert table.loc[2020, "skill_rmse"] == pytest.approx(1.0)  # la red acierta; la referencia no
    assert table.loc[2021, "skill_rmse"] == pytest.approx(-2.0)
    assert table["coverage"].tolist() == [0.5, 0.5]


@pytest.mark.parametrize("cell", ["rnn", "lstm", "gru"])
def test_celda_en_numpy_igual_que_pytorch(cell):
    torch.manual_seed(0)
    net = RNNRegressor(n_features=4, hidden_size=6, num_layers=1, dropout=0.0, cell=cell)
    x = torch.randn(9, 4)
    with torch.no_grad():
        expected, _ = net.rnn(x[None])
    trace = explore.cell_trace(cell, explore.cell_weights(net.rnn), x.numpy())
    np.testing.assert_allclose(trace["h"], expected[0].numpy(), atol=1e-5)
    assert set(trace) - {"h", "c"} == set(explore.GATES[cell])


@pytest.mark.parametrize("cell", ["rnn", "lstm", "gru"])
@pytest.mark.parametrize("layers", [1, 2])
def test_numero_de_parametros(cell, layers):
    net = RNNRegressor(16, 32, layers, 0.0, cell=cell, n_outputs=3)
    real = sum(p.numel() for p in net.parameters())
    assert explore.count_params(cell, 16, 32, layers, 3) == real


def test_figuras_con_datos_sinteticos():
    """Las figuras de explore_plots se construyen sin error con lo que devuelve explore."""
    from matplotlib.figure import Figure

    from oil_rnn import explore_plots as plots

    cfg, raw = _cfg(), _raw()
    stages = explore.pipeline_stages(cfg, raw)
    prep, df = _fitted()
    win = explore.window_at(prep, df, df["t"].iloc[30])
    trace = explore.cell_trace(
        "gru", explore.cell_weights(RNNRegressor(3, 4, 1, 0.0, cell="gru").rnn), win["X"].to_numpy()
    )
    pred = pd.DataFrame(
        {
            "time": df["t"].iloc[:20].to_numpy(),
            "y_true": df["y"].iloc[:20].to_numpy(),
            "y_pred": df["y"].iloc[:20].to_numpy() + 1,
            "y_lo": df["y"].iloc[:20].to_numpy() - 2,
            "y_hi": df["y"].iloc[:20].to_numpy() + 2,
            "y_baseline": df["y"].iloc[:20].to_numpy() - 1,
        }
    )
    figures = [
        plots.missing_map(explore.missing_by_year(raw, "t")),
        plots.fill_effect(stages["corte"], stages["relleno"], "t", "x"),
        plots.input_forms(explore.input_stages(prep, df), "y", prep.clip),
        plots.window_heatmap(win),
        plots.window_on_price(df, "t", "y", win),
        plots.folds_timeline(explore.fold_table(cfg, df.iloc[:90]), 2),
        plots.gates_heatmap(trace, "gru"),
        plots.predictions_plot(pred),
        plots.bars_by_group(explore.skill_by(pred), "skill_rmse", "Mejora"),
        plots.pinball_curves(),
    ]
    assert all(isinstance(f, Figure) for f in figures)
