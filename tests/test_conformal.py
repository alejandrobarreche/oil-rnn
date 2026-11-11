"""Calibración conforme del intervalo (sin data/)."""

import numpy as np
import pytest
import yaml

from oil_rnn import conformal
from oil_rnn.config import load_config
from oil_rnn.train import load_calibration


def test_puntuaciones_y_correccion():
    y = np.array([10.0, 12.0, 9.0])
    s = conformal.scores(y, lo=[9, 9, 10], hi=[11, 11, 11], target_mode="change")
    np.testing.assert_allclose(s, [-1, 1, 1])  # dentro sobra 1; fuera por 1 y por 1
    # n = 9, coverage 0,8: k = ⌈10·0,8⌉ = 8 → octava puntuación ordenada
    assert conformal.correction(np.arange(9.0), 0.8) == 7.0
    assert conformal.correction(np.arange(3.0), 0.99) == 2.0  # k no pasa de n


def test_correccion_relativa_en_log():
    lo, hi = conformal.apply([90.0], [100.0], [110.0], q=np.log(1.1), target_mode="log_return")
    np.testing.assert_allclose([lo[0], hi[0]], [90 / 1.1, 110 * 1.1])
    # Estrechar no cruza la mediana
    lo, hi = conformal.apply([99.0], [100.0], [101.0], q=-1.0, target_mode="change")
    assert lo[0] == hi[0] == 100.0


def test_cobertura_con_datos_intercambiables():
    """Intervalo de la red demasiado estrecho (cubre ~38 %): calibrado, cubre ~80 % en datos
    nuevos de la misma distribución."""
    rng = np.random.default_rng(0)
    ycal, ynew = rng.normal(0, 1, 2000), rng.normal(0, 1, 20000)
    lo, hi = -0.5, 0.5
    conf = conformal.fit(ycal, np.full(2000, lo), np.full(2000, hi), "change", 0.8, horizon=1)
    new_lo, new_hi = conformal.apply(lo, 0.0, hi, conf["correction"], "change")
    cov = np.mean((new_lo <= ynew) & (ynew <= new_hi))
    assert 0.78 < cov < 0.83
    assert conf["n"] == 2000 and conf["n_independent"] == 2000


def test_calibrar_cuantiles_solo_mueve_los_extremos():
    pred = np.array([[9.0, 10.0, 11.0]])
    conf = {"correction": 0.5, "mode": "change"}
    out = conformal.calibrate_quantiles(pred, [0.1, 0.5, 0.9], conf)
    np.testing.assert_allclose(out, [[8.5, 10.0, 11.5]])
    np.testing.assert_allclose(pred, [[9.0, 10.0, 11.0]])  # no modifica la entrada


def test_calibracion_exige_la_misma_configuracion(tmp_path, monkeypatch):
    cfg = load_config()
    folder = tmp_path / "cv-run"
    folder.mkdir()
    (folder / "config.yaml").write_text(yaml.safe_dump(cfg))
    (folder / "conformal.json").write_text('{"correction": 0.1, "mode": "log_return"}')
    monkeypatch.setattr("oil_rnn.train.run_paths", lambda run_id: {"run": tmp_path / run_id})

    assert load_calibration("cv-run", cfg)["source_run"] == "cv-run"
    other = load_config(overrides=["model.cell=gru"])
    with pytest.raises(ValueError, match="model"):
        load_calibration("cv-run", other)
