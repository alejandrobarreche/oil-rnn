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
