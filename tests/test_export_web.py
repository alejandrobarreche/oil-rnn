"""Exportar solo algunos horizontes reutiliza los demás tal como están en web/public/model."""

import json

import pytest

pytest.importorskip("onnxruntime")
from oil_rnn import export_web  # noqa: E402
from oil_rnn.data import file_sha256  # noqa: E402


@pytest.fixture
def model_dir(tmp_path, monkeypatch):
    onnx = tmp_path / "h21.onnx"
    onnx.write_bytes(b"red de 21 dias")
    entry = {"horizon": 21, "run_id": "run-21", "model_file": onnx.name}
    entry |= {"sha256": file_sha256(onnx), "release": "model-v1"}
    (tmp_path / "manifest.json").write_text(json.dumps({"models": [entry]}), encoding="utf-8")
    (tmp_path / "examples.json").write_text(json.dumps({"21": [{"rows": []}]}), encoding="utf-8")
    monkeypatch.setattr(export_web, "WEB_MODEL_DIR", tmp_path)
    return tmp_path


def test_reutiliza_el_mismo_run_con_la_nueva_release(model_dir):
    entry, examples = export_web.reuse_model(21, "run-21", "model-v2")
    assert entry["run_id"] == "run-21" and entry["release"] == "model-v2"
    assert examples == [{"rows": []}]


def test_no_reutiliza_otro_run(model_dir):
    with pytest.raises(ValueError, match="run-otro"):
        export_web.reuse_model(21, "run-otro", "model-v2")


def test_no_reutiliza_un_onnx_cambiado(model_dir):
    (model_dir / "h21.onnx").write_bytes(b"otra red")
    with pytest.raises(ValueError, match="hash"):
        export_web.reuse_model(21, "run-21", "model-v2")
