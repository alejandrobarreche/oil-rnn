"""Comprobaciones de la red con cuantiles, la pérdida pinball y el entrenamiento (sin data/)."""

import numpy as np
import pandas as pd
import pytest
import torch

from oil_rnn.config import load_config
from oil_rnn.metrics import compute_metrics
from oil_rnn.model import Predictor, RNNRegressor, pinball_loss, save_model, train_model


class _Run:
    """Sustituto de Run: guarda las métricas en memoria."""

    def __init__(self):
        self.logged = []

    def log_metrics(self, metrics, step=None):
        self.logged.append((step, metrics))


@pytest.mark.parametrize("cell", ["rnn", "lstm", "gru"])
def test_cuantiles_ordenados(cell):
    torch.manual_seed(0)
    net = RNNRegressor(n_features=3, hidden_size=8, num_layers=1, dropout=0, cell=cell, n_outputs=3)
    out = net(torch.randn(50, 7, 3))
    assert out.shape == (50, 3)
    assert (out[:, 1:] >= out[:, :-1]).all()


def test_un_valor_sin_cuantiles():
    net = RNNRegressor(n_features=2, hidden_size=4, num_layers=1, dropout=0)
    assert net(torch.randn(5, 3, 2)).shape == (5,)


def test_pinball():
    q = torch.tensor([0.1, 0.9])
    y = torch.tensor([1.0])
    # Error e = 1 - 0 = 1 > 0: q·e → (0,1 + 0,9) / 2
    assert pinball_loss(torch.zeros(1, 2), y, q).item() == pytest.approx(0.5)
    # Error e = 1 - 2 = -1 < 0: (q - 1)·e → (0,9 + 0,1) / 2
    assert pinball_loss(torch.full((1, 2), 2.0), y, q).item() == pytest.approx(0.5)
    # Sobrestimar cuesta poco al cuantil 0,9 y mucho al 0,1
    one = pinball_loss(torch.tensor([[2.0]]), y, torch.tensor([0.9])).item()
    assert one == pytest.approx(0.1)


def _cfg(**train):
    overrides = [
        "data.target=y",
        "data.time_column=t",
        "data.features=[y]",
        "data.window=5",
        "data.horizon=2",
        "data.target_mode=log_return",
        "data.inputs.transform=returns",
        "data.inputs.diff=[]",
        "data.inputs.log1p_diff=[]",
        "data.inputs.floor={}",
        "data.inputs.volatility=null",
        "model.hidden_size=4",
        "model.num_layers=1",
        "train.batch_size=16",
    ]
    overrides += [f"train.{k}={v}" for k, v in train.items()]
    return load_config(overrides=overrides)


def _prices(n=120):
    rng = np.random.default_rng(0)
    y = 50 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
    return pd.DataFrame({"t": pd.date_range("2020-01-01", periods=n), "y": y})


def test_min_epochs_y_registro(tmp_path, monkeypatch):
    monkeypatch.setattr("oil_rnn.model.get_device", lambda: torch.device("cpu"))
    df = _prices()
    cfg = _cfg(epochs=4, patience=1, min_epochs=4, learning_rate=0.0)  # val_loss nunca mejora
    run = _Run()
    fitted = train_model(cfg, df.iloc[:80], df.iloc[80:], run)
    epochs = [s for s, _ in run.logged if s is not None]
    assert epochs == [1, 2, 3, 4]  # sin min_epochs pararía en la 2
    summary = run.logged[-1][1]
    assert {"n_params", "train_seconds", "epochs_run", "best_epoch"} <= summary.keys()
    assert summary["n_params"] == sum(p.numel() for p in fitted["net"].parameters())

    # Guardado y carga: la mediana es y_pred y el intervalo la contiene.
    save_model(fitted, tmp_path, cfg)
    out = Predictor.load(tmp_path).predict_frame(df.iloc[80:])
    assert out["y_quantiles"].shape[1] == 3
    assert (out["y_lo"] <= out["y_pred"]).all() and (out["y_pred"] <= out["y_hi"]).all()

    # Referencia del intervalo: cuantiles de train del rendimiento aplicados al último precio.
    prep = fitted["preprocessor"]
    expected = out["y_baseline"][:, None] * np.exp(np.quantile(prep.train_targets, [0.1, 0.5, 0.9]))
    np.testing.assert_allclose(out["y_ref_quantiles"], expected, rtol=1e-5)
    m = compute_metrics("regression", out, prefix="val_")
    keys = {"val_coverage", "val_baseline_coverage", "val_pinball_skill", "val_direction_accuracy"}
    assert keys <= m.keys()
