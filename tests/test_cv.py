"""Pliegues walk-forward y purga (sin data/)."""

import numpy as np
import pandas as pd
import pytest

from oil_rnn.data import (
    CONTEXT_COLUMN,
    fold_boundaries,
    segment,
    training_bounds,
    training_segments,
)


def test_bloques_consecutivos_hasta_el_final():
    bounds = fold_boundaries(n=5409, folds=4, block=504)
    assert bounds[-1][1] == 5409
    assert all(e - s == 504 for s, e in bounds)
    assert all(bounds[i][1] == bounds[i + 1][0] for i in range(3))
    with pytest.raises(ValueError):
        fold_boundaries(n=100, folds=4, block=25)


@pytest.mark.parametrize("h", [1, 5, 63, 252])
def test_purga_sin_targets_posteriores_al_origen(h):
    boundary, holdout = 4000, 252
    fit_end, stop_start, stop_end = training_bounds(boundary, h, holdout)
    # Primera predicción tras la frontera: target `boundary`, hecha desde boundary - h.
    assert stop_end - 1 <= boundary - h  # último target de parada
    assert fit_end - 1 <= stop_start - h  # último target de ajuste ≤ origen del primero de parada
    assert stop_end - stop_start == holdout
    # La purga es la mínima: un target más ya sería posterior al origen.
    assert stop_end == boundary - h + 1 and fit_end == stop_start - h + 1


def test_segmentos_con_contexto():
    df = pd.DataFrame({"t": np.arange(100), "y": np.arange(100.0)})
    part = segment(df, start=60, end=80, history=10)
    assert part["t"].tolist() == list(range(50, 80))
    assert part.loc[part[CONTEXT_COLUMN], "t"].tolist() == list(range(50, 60))

    fit, stop = training_segments(df, boundary=90, horizon=5, holdout=20, history=10)
    stop_targets = stop.loc[~stop[CONTEXT_COLUMN], "t"]
    assert stop_targets.max() == 90 - 5  # nada posterior al origen de la fila 90
    assert fit["t"].max() == stop_targets.min() - 5
    assert CONTEXT_COLUMN not in fit


def test_calibracion_por_pliegues_solo_con_el_pasado(tmp_path):
    from oil_rnn import conformal
    from oil_rnn.config import load_config
    from oil_rnn.cv import _calibrate

    class _Run:
        dir, logged = tmp_path, {}

        def log_metrics(self, m, step=None):
            self.logged.update(m)

    def frame(width):  # intervalo de la red [y_pred - width, y_pred + width]
        rng = np.random.default_rng(int(width * 10))
        y = 100 * np.exp(rng.normal(0, 0.05, 300))
        return pd.DataFrame(
            {"y_true": y, "y_pred": 100.0, "y_lo": 100 - width, "y_hi": 100 + width}
        )

    cfg = load_config(overrides=["data.horizon=5"])
    frames = [frame(w) for w in (1.0, 2.0, 3.0, 4.0)]
    run = _Run()
    out = _calibrate(cfg, frames, run)
    # El pliegue 2 se corrige solo con el 1
    conf = conformal.fit(frames[0]["y_true"], 99.0, 101.0, "log_return", 0.8, 5)
    lo, hi = conformal.apply(98.0, 100.0, 102.0, conf["correction"], "log_return")
    y = frames[1]["y_true"]
    assert run.logged["fold2_coverage_cqr"] == pytest.approx(np.mean((lo <= y) & (y <= hi)))
    assert "fold1_coverage_cqr" not in run.logged
    # La corrección guardada usa los cuatro bloques
    saved = conformal.fit(
        pd.concat(frames)["y_true"],
        pd.concat(frames)["y_lo"],
        pd.concat(frames)["y_hi"],
        "log_return",
        0.8,
        5,
    )
    assert out["cv_conformal_correction"] == pytest.approx(saved["correction"])
    assert (tmp_path / "conformal.json").exists()


def test_rejilla_de_la_comparativa():
    from oil_rnn.config import load_config
    from oil_rnn.sweep import combinations

    cfg = load_config()
    combos = combinations(cfg)
    s = cfg["sweep"]
    n = len(s["cells"]) * len(s["horizons"]) * len(s["hidden_size"]) * len(s["depth"])
    assert len(combos) == n * len(s["learning_rate"])
    assert len({name for name, _ in combos}) == len(combos)  # el nombre identifica la combinación
    assert all(name.startswith(f"{s['prefix']}-") for name, _ in combos)
