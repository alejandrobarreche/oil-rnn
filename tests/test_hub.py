"""Lo que se sube a Hugging Face: solo modelos de web.models y con su hash correcto."""

import json

import pytest

from oil_rnn import hub
from oil_rnn.data import file_sha256

QUALITY = {
    "horizon": 21,
    "n": 10,
    "period": ["2023-01-01", "2026-11-03"],
    "metrics": {"mae": 7.5, "rmse": 9.0, "coverage80": 0.8, "hit_rate": 0.55},
    "baseline": {"mae": 7.0, "rmse": 8.5, "coverage80": 0.79, "hit_rate_best_constant": 0.5},
}


@pytest.fixture
def project(tmp_path, monkeypatch):
    web_model, web_data = tmp_path / "model", tmp_path / "data"
    web_model.mkdir()
    web_data.mkdir()
    onnx = web_model / "h21.onnx"
    onnx.write_bytes(b"red de 21 dias")
    entry = {"horizon": 21, "run_id": "run-21", "model_file": onnx.name, "cell": "lstm"}
    entry |= {"sha256": file_sha256(onnx), "window": 20, "target_mode": "log_return"}
    entry |= {"features": ["brent", "wti"]}
    (web_model / "manifest.json").write_text(json.dumps({"models": [entry]}), encoding="utf-8")
    (web_data / "quality.json").write_text(json.dumps([QUALITY]), encoding="utf-8")
    run, model = tmp_path / "runs" / "run-21", tmp_path / "models" / "run-21"
    run.mkdir(parents=True)
    model.mkdir(parents=True)
    (model / "model.pt").write_bytes(b"pesos")
    (run / "config.yaml").write_text("seed: 0\n", encoding="utf-8")
    monkeypatch.setattr(hub, "WEB_MODEL_DIR", web_model)
    monkeypatch.setattr(hub, "WEB_DATA_DIR", web_data)
    monkeypatch.setattr(hub, "run_paths", lambda r: {"run": run, "model": model})
    return tmp_path


CFG = {"web": {"models": {21: "run-21"}}}


def test_arma_onnx_pesos_y_model_card(project, tmp_path):
    out = tmp_path / "out"
    assert hub.stage(CFG, out, None, "u/oil-rnn") == [21]
    for f in ("onnx/h21.onnx", "onnx/manifest.json", "pytorch/h21/model.pt"):
        assert (out / f).exists()
    assert (out / "pytorch/h21/config.yaml").exists()
    card = (out / "README.md").read_text(encoding="utf-8")
    assert "| 21 | LSTM | 10 | 7,50 | 7,00 |" in card and "github.com/u/oil-rnn" in card


def test_rechaza_un_onnx_cambiado(project, tmp_path):
    (project / "model" / "h21.onnx").write_bytes(b"otra red")
    with pytest.raises(ValueError, match="hash"):
        hub.stage(CFG, tmp_path / "out", None, "u/oil-rnn")


def test_avisa_si_faltan_los_pesos(project, tmp_path):
    (project / "models" / "run-21" / "model.pt").unlink()
    with pytest.raises(FileNotFoundError, match="h=21"):
        hub.stage(CFG, tmp_path / "out", None, "u/oil-rnn")


def test_rechaza_un_horizonte_sin_modelo(project, tmp_path):
    with pytest.raises(ValueError, match="63"):
        hub.stage(CFG, tmp_path / "out", {63}, "u/oil-rnn")
