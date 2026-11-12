"""Explorador local del proceso: el dato, la ventana, la validación, los modelos y los resultados.

    make explore-install     una vez: instala Streamlit
    make explore             abre http://localhost:8501

Solo lee: data/, runs/ y artifacts/. No entrena, no evalúa y no necesita los pesos de models/.
Toda la lógica está en oil_rnn.explore y las figuras en oil_rnn.explore_plots (las mismas de los
cuadernos 02–05); aquí solo se eligen parámetros y se muestran.
"""

from __future__ import annotations

import json

import pandas as pd
import streamlit as st
import torch

from oil_rnn import explore as ex
from oil_rnn import explore_plots as plots
from oil_rnn.config import load_config
from oil_rnn.data import load_split, load_train_val
from oil_rnn.features import Preprocessor
from oil_rnn.model import RNNRegressor
from oil_rnn.paths import DECISIONS_FILE, SPLITS_MANIFEST

HORIZONS = [5, 21, 63, 252]
CFG = load_config()
TIME, TARGET = CFG["data"]["time_column"], CFG["data"]["target"]


# ── Carga (una vez por sesión) ─────────────────────────────
@st.cache_data
def stages() -> dict[str, pd.DataFrame]:
    return ex.pipeline_stages(CFG)


@st.cache_data
def development() -> pd.DataFrame:
    return load_train_val()


@st.cache_data
def manifest() -> dict:
    return json.loads(SPLITS_MANIFEST.read_text(encoding="utf-8"))


@st.cache_data
def runs() -> pd.DataFrame:
    return ex.runs_table()


@st.cache_resource
def preprocessor(horizon: int) -> Preprocessor:
    cfg = load_config(overrides=[f"data.horizon={horizon}"])
    return Preprocessor(cfg).fit(load_split("train"))  # media y desviación: solo train


def horizon_picker(key: str) -> int:
    label = lambda h: f"{h} filas · {plots.HORIZON_LABEL[h]}"  # noqa: E731
    return st.radio("Horizonte", HORIZONS, format_func=label, horizontal=True, key=key)


def see(section: str) -> None:
    st.caption(f"Decisiones relacionadas: apartado {section} de docs/DECISIONES.md.")


# ── Páginas ────────────────────────────────────────────────
def page_data() -> None:
    st.header("El dato: del archivo a lo que entra en la red")
    all_stages = stages()
    summary = pd.DataFrame(
        {
            "filas": {k: len(v) for k, v in all_stages.items()},
            "celdas vacías": {k: int(v.isna().sum().sum()) for k, v in all_stages.items()},
            "primera fecha": {k: v[TIME].min().date() for k, v in all_stages.items()},
            "última fecha": {k: v[TIME].max().date() for k, v in all_stages.items()},
        }
    )
    summary.index = [ex.STAGE_LABELS[k] for k in summary.index]
    st.dataframe(summary, use_container_width=True)

    st.subheader("Huecos por año y columna")
    name = st.selectbox("Etapa", ex.STAGES, format_func=ex.STAGE_LABELS.get)
    st.pyplot(plots.missing_map(ex.missing_by_year(all_stages[name], TIME)))

    st.subheader("Qué hace el relleno con un hueco")
    before, after = all_stages["corte"], all_stages["relleno"]
    columns = [c for c in before.columns if c != TIME and before[c].isna().any()]
    left, right = st.columns(2)
    column = left.selectbox("Columna", columns, index=columns.index("henry_hub"))
    dates = pd.to_datetime(before[TIME])
    default = (pd.Timestamp("2019-11-01").date(), pd.Timestamp("2020-02-01").date())
    period = right.date_input(
        "Periodo", default, min_value=dates.min().date(), max_value=dates.max().date()
    )
    if len(period) == 2:
        shown = (dates >= pd.Timestamp(period[0])) & (dates <= pd.Timestamp(period[1]))
        st.pyplot(plots.fill_effect(before[shown], after[shown], TIME, column))
    st.caption("Un valor repetido da rendimiento 0 ese día: la red no sabe que faltaba el dato.")

    st.subheader("Una entrada en sus cuatro formas")
    prep = preprocessor(5)
    forms = ex.input_stages(prep, development())
    entry = st.selectbox("Entrada de la red", prep.inputs)
    st.pyplot(plots.input_forms(forms, entry, prep.clip))
    z = forms["estandarizada"][entry]
    st.caption(
        f"Media y desviación ajustadas con train. Máximo: {z.abs().max():.1f} desviaciones; "
        f"{int((z.abs() > prep.clip).sum())} días recortados a ±{prep.clip:g}. Se muestra "
        "train + val; test no aparece."
    )
    see("1 a 3")


def page_window() -> None:
    st.header("La ventana: qué ve la red y qué tiene que acertar")
    h = horizon_picker("window_h")
    prep, dev = preprocessor(h), development()
    dates = pd.to_datetime(dev[TIME])
    first = dates.iloc[prep.warmup + prep.window - 1].date()
    day = st.date_input(
        "Día del pronóstico",
        pd.Timestamp("2008-07-03").date(),
        min_value=first,
        max_value=dates.max().date(),
    )
    win = ex.window_at(prep, dev, day)
    a, b, c = st.columns(3)
    a.metric("Último precio conocido", f"{win['y_last']:.2f} $", f"{win['origin']:%d/%m/%Y}", "off")
    if win["target"] is None:
        b.metric("Precio real a predecir", "aún no existe")
    else:
        b.metric("Precio real", f"{win['y_true']:.2f} $", f"{win['target']:%d/%m/%Y}", "off")
        c.metric("Lo que aprende la red", f"{win['y']:+.2%}", "log(real / último)", "off")
    st.pyplot(plots.window_on_price(dev, TIME, TARGET, win, margin=max(90, h)))
    st.pyplot(plots.window_heatmap(win))
    st.caption(
        f"La red recibe esta matriz de {prep.window} × {prep.n_features} y nada más: ni el nivel "
        "del precio ni la fecha. Una salida de 0 equivale a la persistencia."
    )
    see("3.5 y 4")


def page_validation() -> None:
    st.header("La validación: cómo se parte el tiempo")
    info, dev = manifest(), development()
    st.pyplot(plots.splits_timeline(stages()["inicio"], TIME, TARGET, info["ranges"]))

    st.subheader("Pliegues walk-forward")
    h = horizon_picker("cv_h")
    table = ex.fold_table(CFG, dev, horizon=h)
    sliding = st.toggle("Ver cómo sería con ventana deslizante (no se ha probado)")
    if sliding:
        years = st.slider("Años de ajuste", 3, 15, 10)
        table["ajuste_desde"] = table["ajuste_hasta"] - pd.DateOffset(years=years)
    st.pyplot(plots.folds_timeline(table, h, info["ranges"]["test"]))
    st.dataframe(table.astype(str), use_container_width=True)
    st.caption(
        f"Purga: {2 * (h - 1)} filas sin usar por pliegue. Sin ella, {h - 1} objetivos de "
        "entrenamiento serían precios posteriores al primer pronóstico del bloque."
    )

    st.subheader("Resultado por pliegue de la configuración elegida")
    chosen = chosen_cv_run(h)
    st.write(describe(chosen))
    left, right = st.columns(2)
    folds = ex.fold_metrics(chosen["run_id"])
    title = "Mejora de RMSE frente a la persistencia (%)"
    left.pyplot(plots.bars_by_group(folds, "skill_vs_baseline", title, xlabel="pliegue"))
    title = "Cobertura del intervalo sin corregir (%)"
    right.pyplot(plots.bars_by_group(folds, "coverage", title, reference=0.8, xlabel="pliegue"))
    st.pyplot(plots.loss_curves(ex.loss_history(chosen["run_id"])))
    st.caption("El punto es la época guardada. Si la línea naranja sube desde el principio, la red "
               "memoriza el tramo de ajuste sin generalizar.")  # fmt: skip
    see("5")


def chosen_cv_run(horizon: int) -> pd.Series:
    """El run de make cv (semilla 42) con la configuración del modelo final de ese horizonte."""
    table = runs()
    final = table[(table["prefix"] == "final") & (table["horizon"] == horizon)].iloc[0]
    return ex.same_config(table[table["prefix"] == "g1"], final).iloc[0]


def describe(run: pd.Series) -> str:
    return (
        f"**{run['cell'].upper()}** · oculto {run['hidden_size']} · {run['num_layers']} capa(s) · "
        f"dropout {run['dropout']:g} · lr {run['learning_rate']:g} · `{run['run_id']}`"
    )


def page_models() -> None:
    st.header("Los modelos: una ventana real por dentro de cada celda")
    left, mid, right = st.columns(3)
    cell = left.radio("Celda", list(plots.CELL_LABEL), format_func=plots.CELL_LABEL.get)
    hidden = mid.select_slider("Unidades ocultas", [4, 8, 16, 32], value=8)
    seed = right.number_input("Semilla de los pesos", 0, 999, 0)
    prep, dev = preprocessor(5), development()
    win = ex.window_at(prep, dev, "2008-07-03")
    torch.manual_seed(int(seed))
    net = RNNRegressor(prep.n_features, hidden, 1, 0.0, cell=cell, n_outputs=3)
    trace = ex.cell_trace(cell, ex.cell_weights(net.rnn), win["X"].to_numpy())
    st.info("Pesos aleatorios, sin entrenar: se ve el mecanismo, no lo aprendido. Los pesos "
            "entrenados están solo en la máquina de Windows.")  # fmt: skip
    st.code(
        {
            "rnn": "h = tanh(W·x + U·h)",
            "lstm": "i, f, o = σ(W·x + U·h)     g = tanh(W·x + U·h)\n"
            "c = f·c + i·g              h = o·tanh(c)",
            "gru": "r, z = σ(W·x + U·h)        n = tanh(W·x + r·(U·h))\nh = (1−z)·n + z·h",
        }[cell],
        language=None,
    )
    st.pyplot(plots.gates_heatmap(trace, cell))

    st.subheader("Parámetros")
    sizes = CFG["sweep"]["hidden_size"]
    params = pd.DataFrame(
        {
            c: [ex.count_params(c, prep.n_features, n, 1, 3) for n in sizes]
            for c in plots.CELL_LABEL
        },
        index=pd.Index(sizes, name="tamaño oculto"),
    )
    left, right = st.columns(2)
    left.pyplot(plots.params_lines(params))
    right.dataframe(params.rename(columns=plots.CELL_LABEL), use_container_width=True)
    right.caption("Una capa, 16 entradas y 3 salidas. La LSTM tiene 4 bloques de pesos; la GRU, "
                  "3; la RNN, 1.")  # fmt: skip

    st.subheader("Pérdida e intervalo")
    left, right = st.columns(2)
    left.pyplot(plots.pinball_curves())
    grid = runs()
    grid = grid[grid["prefix"] == "g1"]
    coverage = grid.groupby("horizon")[["cv_coverage", "cv_coverage_cqr"]].median()
    coverage.columns = ["Sin corregir", "Corregido"]
    right.pyplot(plots.coverage_bars(coverage))
    right.caption("Mediana de las 108 configuraciones de cada horizonte, en validación.")
    see("6 y 9")


def page_results() -> None:
    st.header("Los resultados: rejilla, semillas y test")
    table = runs()
    grid = table[table["prefix"] == "g1"]
    h = horizon_picker("results_h")

    st.subheader("Rejilla en validación")
    metrics = {
        "cv_pinball": ("Pérdida pinball (menor es mejor)", ".2f", False),
        "cv_skill_vs_baseline": ("Mejora de RMSE frente a la persistencia (%)", "+.1f", True),
        "cv_pinball_skill": ("Mejora de pinball frente a cuantiles históricos (%)", "+.1f", True),
        "cv_coverage_cqr": ("Cobertura corregida (%)", ".0f", True),
    }
    metric = st.selectbox("Métrica", list(metrics), format_func=lambda m: metrics[m][0])
    _, fmt, percent = metrics[metric]
    st.pyplot(plots.grid_heatmaps(grid, h, metric, fmt=fmt, percent=percent))
    part = grid[grid["horizon"] == h]
    better = int((part["cv_skill_vs_baseline"] > 0).sum())
    st.caption(f"{better} de {len(part)} configuraciones mejoran el RMSE de la persistencia.")

    st.subheader("Semillas: ¿se distinguen las celdas?")
    others = table[table["prefix"].isin(["g1s7", "g1s123"])]
    base = [ex.same_config(grid, r) for _, r in others[others["prefix"] == "g1s7"].iterrows()]
    st.pyplot(plots.seeds_dots(pd.concat([*base, others]), "cv_pinball"))

    st.subheader("Un run de la rejilla por dentro")
    ordered = part.sort_values("cv_pinball")
    run_id = st.selectbox("Run (ordenados de mejor a peor pinball)", ordered["run_id"])
    run = ordered[ordered["run_id"] == run_id].iloc[0]
    st.write(describe(run))
    pred = ex.cv_predictions(run_id)
    st.pyplot(plots.predictions_plot(pred, "Predicción en los 4 bloques de validación"))
    left, right = st.columns(2)
    title = "Mejora de RMSE por pliegue (%)"
    left.pyplot(plots.bars_by_group(ex.skill_by(pred, "fold"), "skill_rmse", title))
    title = "Mejora de RMSE por año (%)"
    right.pyplot(plots.bars_by_group(ex.skill_by(pred), "skill_rmse", title))

    st.subheader("Test")
    st.warning("Test se evaluó una sola vez. Estas cifras describen el resultado; ninguna "
               "decisión puede apoyarse en ellas.")  # fmt: skip
    if st.toggle("Mostrar la evaluación final en test"):
        final = table[(table["prefix"] == "final") & (table["horizon"] == h)].iloc[0]
        st.write(describe(final))
        a, b, c, d = st.columns(4)
        a.metric("RMSE red", f"{final['test_rmse']:.2f} $")
        b.metric("RMSE persistencia", f"{final['test_baseline_rmse']:.2f} $")
        c.metric("Mejora de RMSE", f"{final['test_skill_vs_baseline']:+.1%}")
        d.metric("Cobertura (objetivo 80 %)", f"{final['test_coverage']:.0%}")
        pred = ex.test_predictions(final["run_id"])
        st.pyplot(plots.predictions_plot(pred, "Predicción en test"))
        yearly = ex.skill_by(pred)
        left, right = st.columns(2)
        left.pyplot(plots.bars_by_group(yearly, "skill_rmse", "Mejora de RMSE por año (%)"))
        title = "Cobertura por año (%)"
        right.pyplot(plots.bars_by_group(yearly, "coverage", title, reference=0.8))
    see("7 y 8")


def page_decisions() -> None:
    st.markdown(DECISIONS_FILE.read_text(encoding="utf-8"))


PAGES = {
    "El dato": page_data,
    "La ventana": page_window,
    "La validación": page_validation,
    "Los modelos": page_models,
    "Los resultados": page_results,
    "Decisiones": page_decisions,
}


def main() -> None:
    st.set_page_config(page_title="oil-rnn · explorador", layout="wide")
    st.sidebar.title("oil-rnn")
    st.sidebar.caption("Explorador del proceso. Solo lectura.")
    page = st.sidebar.radio("Página", list(PAGES))
    PAGES[page]()


main()
