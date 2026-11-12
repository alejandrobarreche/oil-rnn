"""Figuras de los cuadernos 02–05 y del explorador. Reciben lo que devuelve explore.py.

Cada función devuelve una matplotlib.figure.Figure creada sin pyplot: no depende del backend,
Jupyter la muestra una sola vez y Streamlit la dibuja con st.pyplot(fig).

Color: un color fijo por celda (rnn, lstm, gru) y por papel (real, red, persistencia) en
todas las figuras; magnitudes en un solo tono; valores con signo en dos tonos con gris en 0.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.figure import Figure
from matplotlib.patches import Patch

INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
CELL_COLOR = {"rnn": BLUE, "lstm": ORANGE, "gru": AQUA}
CELL_LABEL = {"rnn": "RNN", "lstm": "LSTM", "gru": "GRU"}
ROLE = {"real": INK, "red": BLUE, "persistencia": "#8d8c86", "parada": ORANGE, "eval": AQUA}
SEQUENTIAL = LinearSegmentedColormap.from_list("magnitud", ["#eef4fc", BLUE, "#0d3a75"])
DIVERGING = LinearSegmentedColormap.from_list("signo", [ORANGE, "#e9e8e4", BLUE])
HORIZON_LABEL = {5: "1 semana", 21: "1 mes", 63: "3 meses", 252: "1 año"}


def _figure(rows: int = 1, cols: int = 1, size=(10, 3.2), **kwargs):
    fig = Figure(figsize=size, facecolor=SURFACE, layout="constrained")
    axes = fig.subplots(rows, cols, squeeze=False, **kwargs)
    for ax in axes.ravel():
        ax.set_facecolor(SURFACE)
        ax.grid(True, color=GRID, linewidth=0.8)
        ax.set_axisbelow(True)
        ax.tick_params(colors=MUTED, labelsize=9, length=0)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(GRID)
    return fig, axes


def _title(ax, text: str) -> None:
    ax.set_title(text, loc="left", fontsize=11, color=INK, fontweight="bold")


def _heatmap(ax, table: pd.DataFrame, cmap, vmin=None, vmax=None, fmt: str | None = None):
    ax.grid(False)
    image = ax.imshow(table.to_numpy(float), aspect="auto", cmap=cmap, vmin=vmin, vmax=vmax)
    ax.set_xticks(range(table.shape[1]), [str(c) for c in table.columns])
    ax.set_yticks(range(table.shape[0]), [str(i) for i in table.index])
    if fmt:
        values = table.to_numpy(float)
        middle = np.nanmean([image.norm.vmin, image.norm.vmax])
        spread = (image.norm.vmax - image.norm.vmin) or 1.0
        for (i, j), v in np.ndenumerate(values):
            if np.isfinite(v):
                dark = abs(v - middle) / spread > 0.25 and cmap is SEQUENTIAL and v > middle
                ax.text(
                    j,
                    i,
                    format(v, fmt),
                    ha="center",
                    va="center",
                    fontsize=8,
                    color="white" if dark else INK,
                )
    return image


# ── Proceso del dato ───────────────────────────────────────
def missing_map(table: pd.DataFrame, title: str = "Valores vacíos por año y columna") -> Figure:
    """Mapa de huecos: `table` es explore.missing_by_year (filas = año, columnas = variable)."""
    fig, axes = _figure(size=(10, 0.32 * table.shape[1] + 1.2))
    ax = axes[0, 0]
    image = _heatmap(ax, table.T * 100, SEQUENTIAL, vmin=0, vmax=100)
    ax.set_xticks(range(len(table.index)), table.index, rotation=90)
    fig.colorbar(image, ax=ax, label="% de filas sin dato", pad=0.01)
    _title(ax, title)
    return fig


def fill_effect(before: pd.DataFrame, after: pd.DataFrame, time_col: str, column: str) -> Figure:
    """Una columna antes y después de ffill: los puntos naranjas son los valores repetidos."""
    fig, axes = _figure()
    ax = axes[0, 0]
    filled = before[column].isna().to_numpy() & after[column].notna().to_numpy()
    ax.plot(
        after[time_col], after[column], color=ROLE["real"], linewidth=1.2, label="Dato publicado"
    )
    ax.scatter(
        after[time_col][filled],
        after[column][filled],
        s=28,
        color=ORANGE,
        zorder=3,
        label=f"Rellenado con el anterior ({int(filled.sum())})",
    )
    ax.legend(frameon=False, fontsize=9)
    _title(ax, f"{column}: huecos rellenados con el último valor conocido")
    return fig


def input_forms(stages: dict[str, pd.DataFrame], column: str, clip: float | None) -> Figure:
    """Una entrada en sus cuatro formas (explore.input_stages), una debajo de otra."""
    names = [n for n in stages if column in stages[n].columns]
    fig, axes = _figure(len(names), 1, size=(10, 1.9 * len(names)), sharex=True)
    labels = {
        "valor": "Valor publicado",
        "transformada": "Transformada (cambio diario)",
        "estandarizada": "Estandarizada con train (desviaciones)",
        "recortada": "Recortada: lo que entra en la red",
    }
    for ax, name in zip(axes[:, 0], names, strict=True):
        ax.plot(stages[name].index, stages[name][column], color=ROLE["red"], linewidth=0.8)
        if clip and name in ("estandarizada", "recortada"):
            for limit in (-clip, clip):
                ax.axhline(limit, color=ORANGE, linewidth=1, linestyle="--")
        _title(ax, f"{column} · {labels[name]}")
    return fig


def window_heatmap(win: dict) -> Figure:
    """La ventana que ve la red (explore.window_at): entradas × días, en desviaciones."""
    table = win["X"].T
    fig, axes = _figure(size=(10, 0.3 * table.shape[0] + 1.3))
    ax = axes[0, 0]
    limit = float(np.nanmax(np.abs(table.to_numpy()))) or 1.0
    image = _heatmap(ax, table, DIVERGING, vmin=-limit, vmax=limit)
    ticks = np.linspace(0, table.shape[1] - 1, 7).astype(int)
    ax.set_xticks(ticks, [table.columns[i].strftime("%d/%m/%y") for i in ticks])
    fig.colorbar(image, ax=ax, label="desviaciones respecto a train", pad=0.01)
    _title(
        ax,
        f"Lo que ve la red el {win['origin']:%d/%m/%Y}: {table.shape[1]} días × "
        f"{table.shape[0]} entradas",
    )
    return fig


def window_on_price(df: pd.DataFrame, time_col: str, target: str, win: dict, margin: int = 90):
    """El precio alrededor del día del pronóstico: la ventana, el último valor conocido y el
    objetivo. La línea gris horizontal es la persistencia."""
    fig, axes = _figure()
    ax = axes[0, 0]
    dates = pd.to_datetime(df[time_col])
    start, end = win["X"].index[0], win["target"] or win["origin"]
    shown = (dates >= start - pd.Timedelta(days=margin)) & (
        dates <= end + pd.Timedelta(days=margin)
    )
    ax.plot(dates[shown], df[target][shown], color=ROLE["real"], linewidth=1.2, label="Brent")
    ax.axvspan(start, win["origin"], color=BLUE, alpha=0.12, label="Ventana de entrada")
    ax.scatter(
        [win["origin"]],
        [win["y_last"]],
        s=60,
        color=BLUE,
        zorder=3,
        label=f"Último conocido: {win['y_last']:.2f} $",
    )
    if win["target"] is not None:
        goal = f"Objetivo: {win['y_true']:.2f} $ (rendimiento {win['y']:+.1%})"
        ax.plot(
            [win["origin"], win["target"]],
            [win["y_last"]] * 2,
            color=ROLE["persistencia"],
            linestyle="--",
            linewidth=1.5,
            label="Persistencia",
        )
        ax.scatter([win["target"]], [win["y_true"]], s=60, color=ORANGE, zorder=3, label=goal)
    ax.set_ylabel("$/barril", color=MUTED, fontsize=9)
    ax.legend(frameon=False, fontsize=9, ncols=2)
    _title(ax, "Qué se conoce y qué se predice")
    return fig


# ── Validación ─────────────────────────────────────────────
def splits_timeline(df: pd.DataFrame, time_col: str, target: str, ranges: dict) -> Figure:
    """El precio con los tres tramos; `ranges` es data/splits.json["ranges"]."""
    fig, axes = _figure()
    ax = axes[0, 0]
    ax.plot(pd.to_datetime(df[time_col]), df[target], color=ROLE["real"], linewidth=1)
    colors = {"train": BLUE, "val": ORANGE, "test": AQUA}
    for name, (start, end) in ranges.items():
        ax.axvspan(pd.Timestamp(start), pd.Timestamp(end), color=colors[name], alpha=0.14)
    handles = [Patch(color=c, alpha=0.4, label=n) for n, c in colors.items()]
    ax.legend(handles=handles, frameon=False, fontsize=9, ncols=3)
    ax.set_ylabel("$/barril", color=MUTED, fontsize=9)
    _title(ax, "Tres tramos consecutivos: train → val → test")
    return fig


def folds_timeline(table: pd.DataFrame, horizon: int, test: tuple | None = None) -> Figure:
    """Línea de tiempo de explore.fold_table: ajuste, parada y evaluación de cada pliegue.
    Los huecos en blanco entre tramos son la purga. `test` = (desde, hasta) para la fila final."""
    fig, axes = _figure(size=(10, 0.55 * len(table) + 1.4))
    ax = axes[0, 0]
    ax.grid(axis="y", visible=False)
    parts = (
        ("ajuste", BLUE, "Ajuste de pesos"),
        ("parada", ORANGE, "Parada temprana"),
        ("eval", AQUA, "Evaluación"),
    )
    for y, (_, row) in enumerate(table.iterrows()):
        for key, color, _label in parts:
            start, end = row[f"{key}_desde"], row[f"{key}_hasta"]
            if key == "eval" and pd.isna(start) and test:
                start, end = pd.Timestamp(test[0]), pd.Timestamp(test[1])
            if pd.notna(start):
                ax.barh(y, end - start, left=start, height=0.55, color=color)
    ax.set_yticks(
        range(len(table)), [f"Pliegue {i}" if i != "final" else "Modelo final" for i in table.index]
    )
    ax.invert_yaxis()
    ax.xaxis_date()
    ax.legend(
        handles=[Patch(color=c, label=label) for _, c, label in parts],
        frameon=False,
        fontsize=9,
        ncols=3,
        loc="lower left",
        bbox_to_anchor=(0, 1.0),
    )
    ax.set_title(f"Horizonte de {horizon} filas", loc="right", fontsize=9, color=MUTED)
    return fig


def bars_by_group(
    table: pd.DataFrame,
    column: str,
    title: str,
    percent: bool = True,
    reference: float = 0.0,
    xlabel: str = "",
) -> Figure:
    """Una barra por fila de `table` (pliegue o año) con el valor de `column` y una línea de
    referencia (0 para una mejora, 0,8 para una cobertura)."""
    fig, axes = _figure(size=(6, 3))
    ax = axes[0, 0]
    ax.grid(axis="x", visible=False)
    values = table[column].to_numpy(float) * (100 if percent else 1)
    bars = ax.bar([str(i) for i in table.index], values, width=0.55, color=ROLE["red"])
    ax.bar_label(bars, fmt="%+.1f" if reference == 0 else "%.0f", fontsize=9, color=INK, padding=2)
    ax.axhline(reference * (100 if percent else 1), color=INK, linewidth=1)
    ax.set_xlabel(xlabel, color=MUTED, fontsize=9)
    ax.margins(y=0.2)
    _title(ax, title)
    return fig


# ── Modelos ────────────────────────────────────────────────
def gates_heatmap(trace: dict[str, np.ndarray], cell: str) -> Figure:
    """Estado oculto y puertas de explore.cell_trace a lo largo de la ventana."""
    names = {
        "h": "h · estado oculto (−1 a 1)",
        "c": "c · memoria",
        "i": "i · puerta de entrada",
        "f": "f · puerta de olvido",
        "g": "g · candidato",
        "o": "o · puerta de salida",
        "r": "r · puerta de reinicio",
        "z": "z · puerta de actualización",
        "n": "n · candidato",
    }
    keys = list(trace)
    fig, axes = _figure(len(keys), 1, size=(10, 1.5 * len(keys) + 0.4), sharex=True)
    for ax, key in zip(axes[:, 0], keys, strict=True):
        gate = key in "ifozr"
        table = pd.DataFrame(trace[key].T)
        limit = float(np.abs(trace[key]).max()) or 1.0
        image = _heatmap(
            ax,
            table,
            SEQUENTIAL if gate else DIVERGING,
            vmin=0 if gate else -limit,
            vmax=1 if gate else limit,
        )
        ax.set_yticks([])
        ax.set_ylabel("unidades", color=MUTED, fontsize=8)
        ax.set_xticks(np.arange(0, table.shape[1], 10))
        fig.colorbar(image, ax=ax, pad=0.01)
        _title(ax, names[key])
    axes[-1, 0].set_xlabel("paso de la ventana (0 = día más antiguo)", color=MUTED, fontsize=9)
    fig.suptitle(
        f"{CELL_LABEL[cell]} con pesos aleatorios, sin entrenar",
        x=0.01,
        ha="left",
        fontsize=10,
        color=MUTED,
    )
    return fig


def params_lines(table: pd.DataFrame) -> Figure:
    """Parámetros por tamaño oculto: `table` con filas = hidden_size y columnas = celda."""
    fig, axes = _figure(size=(6, 3.2))
    ax = axes[0, 0]
    for cell in table.columns:
        ax.plot(
            table.index, table[cell], color=CELL_COLOR[cell], linewidth=2, marker="o", markersize=6
        )
        ax.annotate(
            CELL_LABEL[cell],
            (table.index[-1], table[cell].iloc[-1]),
            fontsize=9,
            xytext=(6, 0),
            textcoords="offset points",
            va="center",
            color=INK,
        )
    ax.set_xscale("log", base=2)
    ax.set_yscale("log")
    ax.set_xticks(list(table.index), [str(i) for i in table.index])
    ax.set_xlabel("tamaño oculto", color=MUTED, fontsize=9)
    ax.margins(x=0.15)
    _title(ax, "Número de parámetros (escala logarítmica)")
    return fig


def pinball_curves(quantiles=(0.1, 0.5, 0.9)) -> Figure:
    """La pérdida pinball de cada cuantil en función del error (real − previsto)."""
    fig, axes = _figure(size=(6, 3.2))
    ax = axes[0, 0]
    e = np.linspace(-2, 2, 201)
    for q, color in zip(quantiles, (BLUE, ORANGE, AQUA), strict=False):
        loss = np.maximum(q * e, (q - 1) * e)
        ax.plot(e, loss, color=color, linewidth=2)
        ax.annotate(
            f"q = {q}",
            (e[-1], loss[-1]),
            xytext=(6, 0),
            textcoords="offset points",
            fontsize=9,
            va="center",
            color=INK,
        )
    ax.axvline(0, color=INK, linewidth=1)
    ax.set_xlabel(
        "real − previsto   (a la derecha: la red se quedó corta)", color=MUTED, fontsize=9
    )
    ax.margins(x=0.15)
    _title(ax, "Pérdida pinball por cuantil")
    return fig


# ── Resultados ─────────────────────────────────────────────
def grid_heatmaps(
    runs: pd.DataFrame,
    horizon: int,
    metric: str = "cv_pinball",
    fmt: str = ".2f",
    percent: bool = False,
) -> Figure:
    """La rejilla de un horizonte: un panel por celda, tamaño oculto × (capas, dropout, lr).
    Misma escala de color en los tres paneles; más oscuro = valor mayor."""
    data = runs[runs["horizon"] == horizon].copy()
    columns = (data["num_layers"], data["dropout"], data["learning_rate"])
    data["config"] = [f"{n}c · d{d:g} · lr {lr:g}" for n, d, lr in zip(*columns, strict=True)]
    data[metric] = data[metric] * (100 if percent else 1)
    cells = [c for c in CELL_COLOR if c in set(data["cell"])]
    fig, axes = _figure(1, len(cells), size=(4.2 * len(cells), 4.2), sharey=True)
    vmin, vmax = data[metric].min(), data[metric].max()
    for ax, cell in zip(axes[0], cells, strict=True):
        table = data[data["cell"] == cell].pivot(
            index="config", columns="hidden_size", values=metric
        )
        image = _heatmap(ax, table, SEQUENTIAL, vmin=vmin, vmax=vmax, fmt=fmt)
        ax.set_xlabel("tamaño oculto", color=MUTED, fontsize=9)
        _title(ax, CELL_LABEL[cell])
    fig.colorbar(image, ax=axes[0, -1], pad=0.02, label=metric + (" (%)" if percent else ""))
    fig.suptitle(
        f"Rejilla a {horizon} filas ({HORIZON_LABEL.get(horizon, '')})",
        x=0.01,
        ha="left",
        fontsize=10,
        color=MUTED,
    )
    return fig


def loss_curves(history: pd.DataFrame) -> Figure:
    """Pérdida de ajuste y de parada por época (explore.loss_history), un panel por pliegue.
    El punto marca la mejor época: los pesos que se guardan."""
    folds = sorted(history["pliegue"].unique())
    fig, axes = _figure(1, len(folds), size=(3.2 * len(folds) + 0.6, 3), sharey=True)
    for ax, fold in zip(axes[0], folds, strict=True):
        part = history[history["pliegue"] == fold]
        ax.plot(part["epoca"], part["train_loss"], color=BLUE, linewidth=2, label="Ajuste")
        ax.plot(part["epoca"], part["val_loss"], color=ORANGE, linewidth=2, label="Parada")
        best = part.loc[part["val_loss"].idxmin()]
        ax.scatter(
            [best["epoca"]],
            [best["val_loss"]],
            s=60,
            color=ORANGE,
            zorder=3,
            edgecolor=SURFACE,
            linewidth=2,
        )
        ax.set_xlabel("época", color=MUTED, fontsize=9)
        _title(ax, f"Pliegue {fold}" if fold else "Modelo final")
    axes[0, 0].legend(frameon=False, fontsize=9)
    axes[0, 0].set_ylabel("pérdida pinball (estandarizada)", color=MUTED, fontsize=9)
    return fig


def seeds_dots(runs: pd.DataFrame, metric: str = "cv_pinball") -> Figure:
    """Los finalistas con 3 semillas: un punto por semilla, un panel por horizonte. Si los
    puntos de dos celdas se mezclan, la diferencia entre ellas no supera a la del azar."""
    horizons = sorted(runs["horizon"].unique())
    fig, axes = _figure(1, len(horizons), size=(2.8 * len(horizons), 3))
    for ax, h in zip(axes[0], horizons, strict=True):
        ax.grid(axis="x", visible=False)
        for x, cell in enumerate(CELL_COLOR):
            values = runs[(runs["horizon"] == h) & (runs["cell"] == cell)][metric]
            ax.scatter(
                [x] * len(values),
                values,
                s=64,
                color=CELL_COLOR[cell],
                zorder=3,
                edgecolor=SURFACE,
                linewidth=2,
            )
        ax.set_xticks(range(3), [CELL_LABEL[c] for c in CELL_COLOR])
        ax.margins(x=0.3, y=0.2)
        _title(ax, f"h = {h}")
    axes[0, 0].set_ylabel(metric, color=MUTED, fontsize=9)
    return fig


def predictions_plot(pred: pd.DataFrame, title: str = "") -> Figure:
    """Precio real, mediana prevista, intervalo y persistencia de un archivo de predicciones."""
    fig, axes = _figure(size=(10, 3.6))
    ax = axes[0, 0]
    ax.fill_between(
        pred["time"],
        pred["y_lo"],
        pred["y_hi"],
        color=BLUE,
        alpha=0.18,
        linewidth=0,
        label="Intervalo de la red",
    )
    ax.plot(
        pred["time"],
        pred["y_baseline"],
        color=ROLE["persistencia"],
        linewidth=1.2,
        label="Persistencia",
    )
    ax.plot(pred["time"], pred["y_pred"], color=BLUE, linewidth=1.6, label="Red (mediana)")
    ax.plot(pred["time"], pred["y_true"], color=ROLE["real"], linewidth=1.6, label="Real")
    ax.set_ylabel("$/barril", color=MUTED, fontsize=9)
    ax.legend(frameon=False, fontsize=9, ncols=4)
    _title(ax, title or "Predicción frente al precio real")
    return fig


def coverage_bars(table: pd.DataFrame) -> Figure:
    """Cobertura del intervalo por horizonte: `table` con filas = horizonte y columnas =
    etiqueta de cada intervalo (por ejemplo, sin corregir y corregido). La línea es el 80 %."""
    fig, axes = _figure(size=(6.5, 3.2))
    ax = axes[0, 0]
    ax.grid(axis="x", visible=False)
    width = 0.8 / table.shape[1]
    for k, (label, color) in enumerate(
        zip(table.columns, (ROLE["persistencia"], BLUE, AQUA), strict=False)
    ):
        x = np.arange(len(table)) + (k - (table.shape[1] - 1) / 2) * width
        bars = ax.bar(x, table[label] * 100, width=width * 0.9, color=color, label=label)
        ax.bar_label(bars, fmt="%.0f", fontsize=8, color=INK, padding=2)
    ax.axhline(80, color=INK, linewidth=1)
    ax.set_xticks(range(len(table)), [f"h = {h}" for h in table.index])
    ax.set_ylim(0, 110)
    ax.legend(frameon=False, fontsize=9, ncols=table.shape[1], loc="upper left")
    _title(ax, "Cobertura del intervalo del 80 % (%)")
    return fig
