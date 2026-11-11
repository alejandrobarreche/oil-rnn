"""Modelo: construcción, entrenamiento, guardado y carga para inferencia.

models/<run_id>/ contiene todo lo necesario para predecir:
    model.pt              pesos de la red + argumentos para reconstruirla
    preprocessor.joblib   preprocesado ajustado en train (features.py)
    model_card.json       framework, tarea, features, clases, run de origen

Uso:
    from oil_rnn.model import Predictor
    out = Predictor.load("models/<run_id>").predict_frame(df)   # y_pred, y_true…
"""

from __future__ import annotations

import json
import logging
import random
import time
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from .features import Preprocessor

log = logging.getLogger("oil_rnn")

FRAMEWORK = "pytorch"


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def get_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class RNNRegressor(nn.Module):
    """RNN/LSTM/GRU apilada: lee la ventana [batch, window, features] y predice un valor
    (n_outputs = 1) o n_outputs cuantiles ordenados de menor a mayor."""

    def __init__(
        self,
        n_features: int,
        hidden_size: int,
        num_layers: int,
        dropout: float,
        cell: str = "lstm",
        n_outputs: int = 1,
    ):
        super().__init__()
        rnn_cls = {"rnn": nn.RNN, "lstm": nn.LSTM, "gru": nn.GRU}[cell]
        self.rnn = rnn_cls(
            n_features,
            hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.n_outputs = n_outputs
        self.head = nn.Linear(hidden_size, n_outputs)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.rnn(x)
        z = self.head(out[:, -1])  # estado del último paso de la ventana
        if self.n_outputs == 1:
            return z.squeeze(-1)
        # Cuantiles sin cruces por construcción: el primero libre y cada siguiente le suma un
        # incremento positivo (softplus).
        steps = torch.cat([z[:, :1], nn.functional.softplus(z[:, 1:])], dim=1)
        return torch.cumsum(steps, dim=1)


def pinball_loss(pred: torch.Tensor, y: torch.Tensor, quantiles: torch.Tensor) -> torch.Tensor:
    """Pérdida cuantílica media: para el cuantil q, q·e si e = y - pred >= 0 y (q-1)·e si no.
    Su mínimo en esperanza está en el cuantil q de la distribución condicional."""
    e = y[:, None] - pred
    return torch.maximum(quantiles * e, (quantiles - 1) * e).mean()


def _quantiles(cfg: dict) -> list[float] | None:
    """model.quantiles ordenados y con la mediana (es la predicción puntual), o None."""
    q = cfg["model"].get("quantiles")
    if not q:
        return None
    q = sorted(float(v) for v in q)
    if 0.5 not in q or not all(0 < v < 1 for v in q):
        raise ValueError(f"model.quantiles debe estar en (0, 1) e incluir 0.5: {q}")
    return q


def build_net(init: dict) -> nn.Module:
    return RNNRegressor(**init)


def _net_init(cfg: dict, prep: Preprocessor) -> dict:
    m = cfg["model"]
    return {
        "n_features": prep.n_features,
        "hidden_size": int(m["hidden_size"]),
        "num_layers": int(m["num_layers"]),
        "dropout": float(m.get("dropout", 0.0)),
        "cell": m.get("cell", "lstm"),
        "n_outputs": len(_quantiles(cfg) or [None]),
    }


def _arrays(prep: Preprocessor, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    w = prep.windows(df)
    return w["X"], w["y"]


def train_model(cfg: dict, train_df: pd.DataFrame, val_df: pd.DataFrame, run) -> dict:
    tcfg = cfg["train"]
    clf = cfg["task"] == "classification"
    prep = Preprocessor(cfg).fit(train_df)
    Xt, yt = _arrays(prep, train_df)
    Xv, yv = _arrays(prep, val_df)

    def loader(X, y, shuffle):
        ds = TensorDataset(
            torch.as_tensor(X, dtype=torch.float32),
            torch.as_tensor(y, dtype=torch.long if clf else torch.float32),
        )
        return DataLoader(ds, batch_size=tcfg["batch_size"], shuffle=shuffle)

    train_dl, val_dl = loader(Xt, yt, True), loader(Xv, yv, False)
    device = get_device()
    init = _net_init(cfg, prep)
    net = build_net(init).to(device)
    quantiles = _quantiles(cfg)
    if clf:
        loss_fn = nn.CrossEntropyLoss()
    elif quantiles:
        q = torch.tensor(quantiles, dtype=torch.float32, device=device)
        loss_fn = lambda pred, y: pinball_loss(pred, y, q)  # noqa: E731
    else:
        loss_fn = nn.MSELoss()
    optimizer = torch.optim.Adam(net.parameters(), lr=tcfg["learning_rate"])
    n_params = sum(p.numel() for p in net.parameters())
    log.info(
        "Entrenando %s (%s, %d parámetros) en %s · %d ejemplos de train, %d de val",
        type(net).__name__,
        init["cell"],
        n_params,
        device,
        len(Xt),
        len(Xv),
    )

    def epoch_loss(dl, train: bool) -> float:
        net.train(train)
        total = 0.0
        with torch.set_grad_enabled(train):
            for xb, yb in dl:
                xb, yb = xb.to(device), yb.to(device)
                loss = loss_fn(net(xb), yb)
                if train:
                    optimizer.zero_grad()
                    loss.backward()
                    optimizer.step()
                total += loss.item() * len(xb)
        return total / len(dl.dataset)

    min_epochs = int(tcfg.get("min_epochs", 0))
    best, best_state, best_epoch, waited = float("inf"), None, 0, 0
    start = time.perf_counter()
    for epoch in range(1, tcfg["epochs"] + 1):
        train_loss, val_loss = epoch_loss(train_dl, True), epoch_loss(val_dl, False)
        run.log_metrics({"train_loss": train_loss, "val_loss": val_loss}, step=epoch)
        log.info("Época %3d  train_loss=%.4f  val_loss=%.4f", epoch, train_loss, val_loss)
        if val_loss < best - 1e-6:
            best, best_epoch, waited = val_loss, epoch, 0
            best_state = {k: v.detach().cpu().clone() for k, v in net.state_dict().items()}
        else:
            waited += 1
            # Antes de min_epochs no se para: evita cortar en la meseta inicial.
            if waited >= tcfg["patience"] and epoch >= min_epochs:
                log.info("Early stopping en la época %d (mejor val_loss=%.4f)", epoch, best)
                break
    net.load_state_dict(best_state)
    run.log_metrics(
        {
            "n_params": n_params,
            "train_seconds": time.perf_counter() - start,
            "epochs_run": epoch,
            "best_epoch": best_epoch,
        }
    )
    return {"net": net.cpu(), "init": init, "preprocessor": prep, "quantiles": quantiles}


def save_model(fitted: dict, model_dir: Path, cfg: dict) -> None:
    torch.save(
        {"state_dict": fitted["net"].state_dict(), "init": fitted["init"]}, model_dir / "model.pt"
    )
    _save_common(fitted["preprocessor"], model_dir, cfg, fitted.get("quantiles"))


class Predictor:
    def __init__(self, net: nn.Module, preprocessor: Preprocessor, card: dict):
        self.net, self.preprocessor, self.card = net.eval(), preprocessor, card

    @classmethod
    def load(cls, model_dir: str | Path) -> Predictor:
        model_dir = Path(model_dir)
        ckpt = torch.load(model_dir / "model.pt", map_location="cpu", weights_only=True)
        net = build_net(ckpt["init"])
        net.load_state_dict(ckpt["state_dict"])
        return cls(net, *_load_common(model_dir))

    @torch.no_grad()
    def forward(self, X: np.ndarray) -> np.ndarray:
        return self.net(torch.as_tensor(X, dtype=torch.float32)).numpy()

    def predict_frame(self, df: pd.DataFrame) -> dict:
        """y_pred es la mediana si el modelo da cuantiles; y_lo / y_hi, el menor y el mayor."""
        w = self.preprocessor.windows(df)
        out = {k: w[k] for k in ("time", "y_true") if k in w}
        pred = self.preprocessor.inverse_target(self.forward(w["X"]), w["y_last"])
        quantiles = self.card.get("quantiles")
        if quantiles:
            out["y_pred"] = pred[:, quantiles.index(0.5)]
            out["y_lo"], out["y_hi"] = pred[:, 0], pred[:, -1]
            out["y_quantiles"] = pred
        else:
            out["y_pred"] = pred
        out["y_baseline"] = w["y_last"]  # persistencia
        return out


# ── común a todos los frameworks ───────────────────────────
def _save_common(
    prep: Preprocessor, model_dir: Path, cfg: dict, quantiles: list[float] | None = None
) -> None:
    joblib.dump(prep, model_dir / "preprocessor.joblib")
    card = {
        "run_id": model_dir.name,
        "framework": FRAMEWORK,
        "task": cfg["task"],
        "data_kind": cfg.get("data_kind", "tabular"),
        "target": cfg["data"]["target"],
        "features": prep.features,
        "inputs": prep.inputs,
        "classes": prep.classes,
        "window": prep.window,
        "horizon": prep.horizon,
        "target_mode": prep.target_mode,
        "quantiles": quantiles,
        "saved_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    (model_dir / "model_card.json").write_text(
        json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _load_common(model_dir: Path) -> tuple:
    prep = joblib.load(model_dir / "preprocessor.joblib")
    card = json.loads((model_dir / "model_card.json").read_text(encoding="utf-8"))
    return prep, card
