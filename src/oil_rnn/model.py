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

from .conformal import calibrate_quantiles
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


class ForecastNet(nn.Module):
    """Conjunto de `n_members` redes iguales entrenadas con semillas distintas: su salida es la
    media de las salidas (los cuantiles medios siguen ordenados). Reduce la varianza que añade
    la inicialización.

    `shrink` = w en [0, 1] contrae la predicción hacia la persistencia: el rendimiento
    predicho (en unidades reales, no escaladas) pasa a ser w·r. Con cuantiles, todos se
    desplazan lo mismo que la mediana, así que el ancho del intervalo no cambia. w = 0 es la
    persistencia y w = 1 la red sin tocar. Va dentro de la red para que el ONNX de la web lo
    aplique igual que Python."""

    def __init__(
        self,
        n_members: int = 1,
        shrink: float = 1.0,
        y_mean: float = 0.0,
        y_scale: float = 1.0,
        median_index: int = 0,
        **net: object,
    ):
        super().__init__()
        self.members = nn.ModuleList(RNNRegressor(**net) for _ in range(n_members))
        self.shrink, self.median_index = float(shrink), int(median_index)
        self.y_mean, self.y_scale = float(y_mean), float(y_scale)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        z = torch.stack([m(x) for m in self.members]).mean(dim=0)
        if self.shrink == 1.0:
            return z
        r = z * self.y_scale + self.y_mean  # rendimiento real predicho
        if r.ndim == 1:
            r = self.shrink * r
        else:
            r = r - (1.0 - self.shrink) * r[:, self.median_index : self.median_index + 1]
        return (r - self.y_mean) / self.y_scale


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
    """Modelos con conjunto (n_members en init) o, los anteriores, una sola red."""
    return ForecastNet(**init) if "n_members" in init else RNNRegressor(**init)


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


class _MemberRun:
    """Registra las métricas del miembro k > 0 del conjunto con el prefijo m<k>_."""

    def __init__(self, run, k: int):
        self.run, self.prefix = run, f"m{k}_" if k else ""

    def log_metrics(self, metrics: dict[str, float], step: int | None = None) -> None:
        self.run.log_metrics({self.prefix + k: v for k, v in metrics.items()}, step=step)


def _fit_member(cfg: dict, init: dict, train_dl, val_dl, run, device) -> RNNRegressor:
    """Una red con early stopping sobre la pérdida de validación; devuelve la mejor época."""
    tcfg = cfg["train"]
    net = RNNRegressor(**init).to(device)
    quantiles = _quantiles(cfg)
    if cfg["task"] == "classification":
        loss_fn = nn.CrossEntropyLoss()
    elif quantiles:
        q = torch.tensor(quantiles, dtype=torch.float32, device=device)
        loss_fn = lambda pred, y: pinball_loss(pred, y, q)  # noqa: E731
    else:
        loss_fn = nn.MSELoss()
    optimizer = torch.optim.Adam(net.parameters(), lr=tcfg["learning_rate"])

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
            "n_params": sum(p.numel() for p in net.parameters()),
            "train_seconds": time.perf_counter() - start,
            "epochs_run": epoch,
            "best_epoch": best_epoch,
        }
    )
    return net.cpu()


def train_model(cfg: dict, train_df: pd.DataFrame, val_df: pd.DataFrame, run) -> dict:
    """Entrena model.ensemble redes (semillas seed, seed+1…) y las une en un ForecastNet.
    Las métricas del primer miembro van sin prefijo; las del miembro k, con m<k>_."""
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

    device = get_device()
    net_init = _net_init(cfg, prep)
    quantiles = _quantiles(cfg)
    n_members = int(cfg["model"].get("ensemble") or 1)
    seed = int(cfg.get("seed", 42))
    log.info(
        "Entrenando %d × %s en %s · %d ejemplos de train, %d de val",
        n_members,
        net_init["cell"],
        device,
        len(Xt),
        len(Xv),
    )
    members = []
    for k in range(n_members):
        set_seed(seed + k)  # misma semilla que antes para el primer miembro
        train_dl, val_dl = loader(Xt, yt, True), loader(Xv, yv, False)
        members.append(_fit_member(cfg, net_init, train_dl, val_dl, _MemberRun(run, k), device))

    init = {
        **net_init,
        "n_members": n_members,
        "shrink": 1.0,
        "y_mean": prep.y_mean,
        "y_scale": prep.y_scale,
        "median_index": quantiles.index(0.5) if quantiles else 0,
    }
    net = build_net(init)
    for slot, member in zip(net.members, members, strict=True):
        slot.load_state_dict(member.state_dict())
    run.log_metrics({"n_params_total": sum(p.numel() for p in net.parameters())})
    return {"net": net.eval(), "init": init, "preprocessor": prep, "quantiles": quantiles}


def set_shrink(fitted: dict, w: float) -> dict:
    """Fija la contracción hacia la persistencia (ForecastNet.shrink) del modelo entrenado."""
    if not 0.0 <= w <= 1.0:
        raise ValueError(f"La contracción debe estar en [0, 1]: {w}")
    fitted["net"].shrink = float(w)
    fitted["init"] = {**fitted["init"], "shrink": float(w)}
    return fitted


def save_model(fitted: dict, model_dir: Path, cfg: dict) -> None:
    torch.save(
        {"state_dict": fitted["net"].state_dict(), "init": fitted["init"]}, model_dir / "model.pt"
    )
    _save_common(
        fitted["preprocessor"],
        model_dir,
        cfg,
        fitted.get("quantiles"),
        fitted.get("conformal"),
        fitted.get("shrink"),
    )


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
        """y_pred es la mediana si el modelo da cuantiles; y_lo / y_hi, el menor y el mayor.
        Añade las referencias triviales: persistencia (y_baseline), cuantiles históricos de
        train (y_ref_quantiles) y la dirección más frecuente en train (up_share >= 0,5: sube)."""
        prep = self.preprocessor
        w = prep.windows(df)
        out = {k: w[k] for k in ("time", "y_true") if k in w}
        pred = prep.inverse_target(self.forward(w["X"]), w["y_last"])
        quantiles = self.card.get("quantiles")
        train_targets = getattr(prep, "train_targets", None)  # no existe en modelos antiguos
        if quantiles:
            if self.card.get("conformal"):
                pred = calibrate_quantiles(pred, quantiles, self.card["conformal"])
            out["y_pred"] = pred[:, quantiles.index(0.5)]
            out["y_lo"], out["y_hi"] = pred[:, 0], pred[:, -1]
            out["y_quantiles"], out["quantiles"] = pred, quantiles
            if train_targets is not None:
                out["y_ref_quantiles"] = prep.reference_quantiles(quantiles, w["y_last"])
        else:
            out["y_pred"] = pred
        out["y_baseline"] = w["y_last"]  # persistencia
        if train_targets is not None and prep.target_mode != "level":
            out["up_share"] = float((train_targets > 0).mean())
        return out


# ── común a todos los frameworks ───────────────────────────
def _save_common(
    prep: Preprocessor,
    model_dir: Path,
    cfg: dict,
    quantiles: list[float] | None = None,
    conformal: dict | None = None,
    shrink: dict | None = None,
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
        "conformal": conformal,  # corrección del intervalo (conformal.py), o None
        "shrink": shrink,  # contracción hacia la persistencia (shrink.py), ya dentro de la red
        "saved_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    (model_dir / "model_card.json").write_text(
        json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _load_common(model_dir: Path) -> tuple:
    prep = joblib.load(model_dir / "preprocessor.joblib")
    card = json.loads((model_dir / "model_card.json").read_text(encoding="utf-8"))
    return prep, card
