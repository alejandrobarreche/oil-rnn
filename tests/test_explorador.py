"""El explorador abre sus seis páginas sin error. Necesita Streamlit (make explore-install) y los
datos y runs del proyecto; si falta algo, se salta."""

import pytest

from oil_rnn.paths import EXPLORER_APP, RUNS_DIR, SPLITS_MANIFEST

pytest.importorskip("streamlit")
from streamlit.testing.v1 import AppTest  # noqa: E402

needs_data = pytest.mark.skipif(
    not SPLITS_MANIFEST.exists() or not any(RUNS_DIR.glob("*_final-*")),
    reason="sin data/splits.json o sin runs finales",
)


@needs_data
@pytest.mark.parametrize("page", range(6))
def test_cada_pagina_se_dibuja(page):
    app = AppTest.from_file(str(EXPLORER_APP), default_timeout=120).run()
    assert not app.exception
    options = app.sidebar.radio[0].options
    app.sidebar.radio[0].set_value(options[page]).run()
    assert not app.exception
