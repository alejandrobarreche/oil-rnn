"""Comprobaciones básicas de estructura y configuración."""

from oil_rnn import paths
from oil_rnn.config import flatten, load_config
from oil_rnn.run import make_run_id


def test_carpetas_existen():
    for folder in (
        paths.RAW_DIR,
        paths.TRAIN_DIR,
        paths.VAL_DIR,
        paths.TEST_DIR,
        paths.RUNS_DIR,
        paths.MODELS_DIR,
        paths.ARTIFACTS_DIR,
    ):
        assert folder.is_dir(), folder


def test_config_y_sobrescrituras():
    cfg = load_config(overrides=["seed=7", "data.target=y", "nuevo.valor=[1,2]"])
    assert cfg["seed"] == 7
    assert cfg["data"]["target"] == "y"
    assert cfg["nuevo"]["valor"] == [1, 2]
    assert "data.target" in flatten(cfg)


def test_run_id_une_las_tres_carpetas():
    run_id = make_run_id("prueba rápida")
    p = paths.run_paths(run_id)
    assert {p["run"].name, p["model"].name, p["artifacts"].name} == {run_id}
