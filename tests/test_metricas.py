"""Métricas de regresión con intervalo, calculadas a mano."""

import numpy as np
import pytest
from scipy import stats

from oil_rnn.metrics import compute_metrics, diebold_mariano


def _out():
    y_true = np.array([10.0, 12.0, 9.0, 11.0])
    last = np.array([10.0, 10.0, 10.0, 10.0])
    q = [0.1, 0.5, 0.9]
    model = np.array([[9, 10.5, 11], [11, 11.5, 13], [8, 9.5, 10], [10, 10.5, 10.8]], float)
    ref = np.tile([8.0, 10.0, 12.0], (4, 1))
    return {
        "y_true": y_true,
        "y_pred": model[:, 1],
        "y_baseline": last,
        "y_quantiles": model,
        "quantiles": q,
        "y_ref_quantiles": ref,
        "up_share": 0.6,
    }


def test_metricas_de_intervalo_y_direccion():
    m = compute_metrics("regression", _out())
    assert m["mse"] == pytest.approx(np.mean([0.25, 0.25, 0.25, 0.25]))
    assert m["baseline_mse"] == pytest.approx(np.mean([0, 4, 1, 1]))
    # Dirección: predice sube, sube, baja, sube; real: igual (10 no es > 10), sube, baja, sube
    assert m["direction_accuracy"] == pytest.approx(0.75)
    # Referencia «siempre sube» (up_share >= 0,5): acierta en 12 y 11
    assert m["baseline_direction_accuracy"] == pytest.approx(0.5)
    # Intervalo [9,11], [11,13], [8,10], [10,10.8]: el 11 queda fuera
    assert m["coverage"] == pytest.approx(0.75)
    assert m["interval_width"] == pytest.approx(np.mean([2, 2, 2, 0.8]))
    assert m["coverage_nominal"] == pytest.approx(0.8)
    assert m["baseline_coverage"] == pytest.approx(1.0)
    assert m["baseline_interval_width"] == pytest.approx(4.0)
    # Pinball por fila (q·e si e >= 0, (q-1)·e si no), e = real - cuantil:
    # modelo [.1 .25 .1] ×3 y [.1 .25 .18]; referencia [.2 0 .2] [.4 1 0] [.1 .5 .3] [.3 .5 .1]
    assert m["pinball"] == pytest.approx(1.88 / 12)
    assert m["baseline_pinball"] == pytest.approx(3.6 / 12)
    assert m["pinball_skill"] == pytest.approx(1 - 1.88 / 3.6)


def test_sin_cuantiles_no_hay_metricas_de_intervalo():
    out = {k: v for k, v in _out().items() if not k.startswith("y_q") and k != "y_ref_quantiles"}
    m = compute_metrics("regression", out)
    assert "coverage" not in m and "rmse" in m and "direction_accuracy" in m


def test_diebold_mariano_a_un_dia_es_la_t_de_una_muestra():
    # Con h = 1 no hay solape: la corrección de Harvey et al. deja la t de Student de d
    rng = np.random.default_rng(0)
    e_model, e_ref = rng.normal(0, 1.0, 200), rng.normal(0, 1.2, 200)
    out = diebold_mariano(e_model, e_ref, horizon=1)
    t = stats.ttest_1samp(e_model**2 - e_ref**2, 0.0)
    assert out["stat"] == pytest.approx(t.statistic)
    assert out["p_value"] == pytest.approx(t.pvalue)
    assert out["kernel"] == "rectangular"


def test_diebold_mariano_signo_y_simetria():
    rng = np.random.default_rng(1)
    small, large = rng.normal(0, 0.5, 300), rng.normal(0, 2.0, 300)
    better = diebold_mariano(small, large, horizon=5)
    worse = diebold_mariano(large, small, horizon=5)
    assert better["stat"] < 0 and better["p_value"] < 0.01
    assert worse["stat"] == pytest.approx(-better["stat"])
    assert worse["p_value"] == pytest.approx(better["p_value"])


def test_diebold_mariano_usa_bartlett_si_la_varianza_sale_negativa():
    # d alterna 1 y -1: autocovarianza de retardo 1 = -(n-1)/n, la suma con pesos iguales es < 0
    n = 100
    alt = np.where(np.arange(n) % 2 == 0, 1.0, -1.0)
    e_model, e_ref = np.sqrt(2 + alt), np.ones(n)  # d = 2 + alt - 1 = 1 + alt
    out = diebold_mariano(e_model, e_ref, horizon=2)
    assert out["kernel"] == "bartlett"
    assert out["diff"] == pytest.approx(1.0)
    assert np.isfinite(out["stat"]) and out["stat"] > 0


def test_diebold_mariano_exige_mas_de_2h_pronosticos():
    with pytest.raises(ValueError):
        diebold_mariano(np.ones(10), np.zeros(10), horizon=6)
