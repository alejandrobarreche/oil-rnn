"""Figuras del README (make readme-figures): un SVG claro y otro oscuro por figura en docs/img/.

Solo leen lo que ya está en git (web/public/data/market.json y explain.json); no entrenan ni
evalúan, así que se pueden generar en cualquier máquina.

Estilo, tomado del sistema de diseño de Sonda (web/src/sonda/tokens.css):
- Papeles de color fijos en todas las figuras: precio real = tinta, red = azul,
  persistencia = gris, validación = tinta, test = naranja. Validados para daltonismo.
- Fondo transparente: GitHub elige la versión clara u oscura con <picture>.
- Solo rejilla horizontal tenue, sin marcos ni marcas de eje, líneas de 2 px.
- Tipografía Inter si está en docs/fonts/; el texto va como trazos, así se ve igual en todas partes.
- Números en formato español: coma decimal y signo menos tipográfico.
"""

from __future__ import annotations

import json
from datetime import datetime

import matplotlib
import numpy as np
from matplotlib import font_manager
from matplotlib.figure import Figure
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter

from .config import load_config
from .paths import FONTS_DIR, README_IMG_DIR, WEB_DATA_DIR, relative

THEMES = {
    "light": {
        "ink": "#0f141c",
        "muted": "#5f6878",
        "grid": "#e5e8ee",
        "model": "#1f5fe0",
        "test": "#c46a00",
        "persistence": "#8b95a4",
        "faint": "#d3d8e0",
    },
    "dark": {
        "ink": "#e6edf3",
        "muted": "#8b95a4",
        "grid": "#262f3b",
        "model": "#5b8def",
        "test": "#c97a1e",
        "persistence": "#6b7686",
        "faint": "#3a4452",
    },
}
HORIZON_LABEL = {5: "1 semana", 21: "1 mes", 63: "3 meses", 252: "1 año"}
WIDTH = 10.0  # pulgadas; el README la muestra al 100 % del ancho
MINUS = "−"


def _setup_fonts() -> str:
    for file in sorted(FONTS_DIR.glob("*.[ot]tf")) if FONTS_DIR.exists() else []:
        font_manager.fontManager.addfont(str(file))
    installed = {f.name for f in font_manager.fontManager.ttflist}
    family = next(f for f in ("Inter", "Helvetica Neue", "Arial", "DejaVu Sans") if f in installed)
    matplotlib.rcParams.update(
        {
            "font.family": family,
            "svg.fonttype": "path",
            "svg.hashsalt": "oil-rnn",  # ids estables: el SVG solo cambia si cambia la figura
            "axes.unicode_minus": True,
        }
    )
    return family


def _num(value: float, decimals: int = 0, sign: bool = False) -> str:
    text = f"{abs(value):,.{decimals}f}".replace(",", " ").replace(".", ",")
    prefix = MINUS if value < 0 else ("+" if sign and value > 0 else "")
    return prefix + text


def _figure(theme: dict, height: float, **kwargs):
    fig = Figure(figsize=(WIDTH, height), layout="constrained")
    fig.patch.set_alpha(0)
    axes = fig.subplots(squeeze=False, **kwargs)
    for ax in axes.ravel():
        ax.patch.set_alpha(0)
        ax.grid(True, axis="y", color=theme["grid"], linewidth=0.8)
        ax.set_axisbelow(True)
        ax.tick_params(colors=theme["muted"], labelsize=10, length=0, pad=6)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.spines["bottom"].set_color(theme["grid"])
    return fig, axes


def _legend(fig, theme: dict, handles: list, labels: list[str]) -> None:
    fig.legend(
        handles,
        labels,
        loc="outside upper left",
        ncol=len(handles),
        frameon=False,
        fontsize=10,
        labelcolor=theme["ink"],
        handlelength=1.6,
        columnspacing=1.8,
    )


def _dates(values) -> np.ndarray:
    return np.array([datetime.fromisoformat(str(v)[:10]) for v in values])


def _years_axis(ax, start: int, end: int, step: int) -> None:
    ticks = [datetime(y, 1, 1) for y in range(start, end + 1, step)]
    ax.set_xticks(ticks, [str(t.year) for t in ticks])


def _dollars(ax) -> None:
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{_num(v)} $"))


# ── Figuras ────────────────────────────────────────────────
def history(theme: dict, market: dict, splits: dict) -> Figure:
    """El Brent desde 2000 con los tramos de validación y test sombreados."""
    t = _dates([p["t"] for p in market["history"]])
    price = np.array([p["close"] for p in market["history"]])
    fig, axes = _figure(theme, 3.3)
    ax = axes[0, 0]
    tints = {"val": (theme["ink"], 0.05), "test": (theme["test"], 0.10)}
    for name, (color, alpha) in tints.items():
        a, b = _dates(splits[name])
        ax.axvspan(a, b, color=color, alpha=alpha, linewidth=0)
    ax.plot(t, price, color=theme["ink"], linewidth=1.3)
    labels = {"train": "Entrenamiento", "val": "Validación", "test": "Test"}
    for name, label in labels.items():
        a, b = _dates(splits[name])
        x = a + (b - a) / 2 if name != "train" else a + (b - a) * 0.04
        ha = "left" if name == "train" else "center"
        color = theme["test"] if name == "test" else theme["ink"]
        ax.text(
            x,
            1.0,
            label,
            transform=ax.get_xaxis_transform(),
            ha=ha,
            va="bottom",
            fontsize=10.5,
            fontweight="semibold",
            color=color,
        )
        span = f"{a.year}–{b.year}"
        ax.text(
            x,
            0.93,
            span,
            transform=ax.get_xaxis_transform(),
            ha=ha,
            va="bottom",
            fontsize=9.5,
            color=theme["muted"],
        )
    for i, va, dy in ((int(price.argmax()), "bottom", 6), (int(price.argmin()), "top", -6)):
        ax.plot(t[i], price[i], "o", markersize=4, color=theme["ink"])
        ax.annotate(
            f"{_num(price[i], 2)} $ · {t[i]:%m/%Y}",
            (t[i], price[i]),
            xytext=(6, dy),
            textcoords="offset points",
            va=va,
            fontsize=9.5,
            color=theme["muted"],
        )
    ax.set_xlim(t[0], t[-1])
    ax.set_ylim(0, price.max() * 1.22)
    _years_axis(ax, 2002, t[-1].year, 4)
    _dollars(ax)
    return fig


def walk_forward(theme: dict, folds: list[dict], splits: dict) -> Figure:
    """Pliegues de make cv y modelo final: qué tramo ajusta, cuál decide la época y cuál evalúa."""
    fig, axes = _figure(theme, 2.7)
    ax = axes[0, 0]
    ax.grid(False)
    colors = {"fit": theme["persistence"], "stop": theme["faint"], "eval": theme["ink"]}
    rows = [f"Pliegue {i}" for i in range(1, len(folds))] + ["Modelo final"]
    for y, fold in enumerate(folds):
        segments = [
            ("fit", fold["ajuste_desde"], fold["ajuste_hasta"], 1.0),
            ("stop", fold["parada_desde"], fold["parada_hasta"], 1.0),
        ]
        if fold["eval_desde"]:
            segments.append(("eval", fold["eval_desde"], fold["eval_hasta"], 1.0))
        else:
            segments.append(("test", *splits["test"], 1.0))
        for kind, a, b, alpha in segments:
            a, b = _dates([a, b])
            color = theme["test"] if kind == "test" else colors[kind]
            ax.barh(y, b - a, left=a, height=0.52, color=color, alpha=alpha, linewidth=0)
    ax.set_yticks(range(len(rows)), rows)
    ax.invert_yaxis()
    ax.tick_params(axis="y", colors=theme["ink"], labelsize=10)
    ax.spines["bottom"].set_visible(False)
    start, end = _dates([folds[0]["ajuste_desde"], splits["test"][1]])
    ax.set_xlim(start, end)
    _years_axis(ax, 2002, end.year, 4)
    handles = [
        Patch(color=theme["persistence"]),
        Patch(color=theme["faint"]),
        Patch(color=theme["ink"]),
        Patch(color=theme["test"]),
    ]
    labels = ["Ajusta los pesos", "Elige la época", "Valida", "Test, una sola vez"]
    _legend(fig, theme, handles, labels)
    return fig


def forecast_scheme(theme: dict, window: dict, n_features: int) -> Figure:
    """Esquema: la red ve una ventana de días y da mediana e intervalo para cada horizonte."""
    price = np.array(window["price"], dtype=float)
    fig, axes = _figure(theme, 2.8, ncols=2, sharey=True, width_ratios=[1.1, 2])
    past, future = axes[0]
    for ax in (past, future):
        ax.grid(False)
        ax.set_yticks([])
        ax.spines["bottom"].set_visible(False)
    days = np.arange(-len(price) + 1, 1)
    past.axvspan(days[0], 0, color=theme["model"], alpha=0.07, linewidth=0)
    past.plot(days, price, color=theme["ink"], linewidth=1.6)
    past.plot(0, price[-1], "o", markersize=6, color=theme["ink"])
    past.set_xticks([days[0], 0], [f"hace {len(price)} días", "hoy"])
    past.text(
        0.04,
        0.95,
        f"Ventana: {len(price)} días · {n_features} variables",
        transform=past.transAxes,
        va="top",
        fontsize=10,
        color=theme["ink"],
    )
    last = price[-1]
    spread = price.std() / np.sqrt(len(price)) * 1.6  # ilustrativo, no es una predicción real
    horizons = list(HORIZON_LABEL)
    future.axhline(last, color=theme["persistence"], linewidth=1.2, linestyle=(0, (4, 3)))
    for x, h in enumerate(horizons, 1):
        half = spread * np.sqrt(h)
        future.plot(
            [x, x],
            [last - half, last + half],
            color=theme["model"],
            alpha=0.28,
            linewidth=11,
            solid_capstyle="round",
        )
        future.plot(x, last, "o", markersize=7, color=theme["model"])
    future.set_xticks(
        range(1, len(horizons) + 1), [f"{HORIZON_LABEL[h]}\n{h} días hábiles" for h in horizons]
    )
    future.set_xlim(0.4, len(horizons) + 0.6)
    future.tick_params(axis="x", colors=theme["ink"])
    top = last + spread * np.sqrt(max(horizons)) * 1.1
    past.set_ylim(min(price.min(), last - (top - last)) * 0.98, top)
    handles = [
        Line2D([], [], color=theme["model"], marker="o", linestyle=""),
        Patch(color=theme["model"], alpha=0.28),
        Line2D([], [], color=theme["persistence"], linestyle=(0, (4, 3))),
    ]
    _legend(fig, theme, handles, ["Mediana", "Intervalo del 80 %", "Persistencia"])
    return fig


def skill(theme: dict, cv: list[dict], test: list[dict]) -> Figure:
    """Mejora del RMSE frente a la persistencia: validación (media de semillas) y test."""
    val = {r["horizon"]: r["skill"] for r in cv if r["chosen"]}
    tst = {r["horizon"]: r["metrics"]["skill_vs_baseline"] for r in test}
    horizons = sorted(tst)
    fig, axes = _figure(theme, 2.9)
    ax = axes[0, 0]
    ax.grid(True, axis="x", color=theme["grid"], linewidth=0.8)
    ax.grid(False, axis="y")
    ax.axvline(0, color=theme["muted"], linewidth=1)
    for y, h in enumerate(horizons):
        v, t = 100 * val[h], 100 * tst[h]
        ax.plot([v, t], [y, y], color=theme["grid"], linewidth=2.5, zorder=1)
        ax.plot(
            v,
            y,
            "o",
            markersize=9,
            markerfacecolor="none",
            markeredgecolor=theme["ink"],
            markeredgewidth=1.8,
            zorder=3,
        )
        ax.plot(t, y, "o", markersize=9, color=theme["test"], zorder=3)
        for x, text, color, weight in (
            (1.06, f"{_num(v, 1, sign=True)} %", theme["muted"], "normal"),
            (1.16, f"{_num(t, 0, sign=True)} %", theme["ink"], "semibold"),
        ):
            ax.text(
                x,
                y,
                text,
                transform=ax.get_yaxis_transform(),
                ha="right",
                va="center",
                fontsize=10,
                color=color,
                fontweight=weight,
            )
    for x, text in ((1.06, "Validación"), (1.16, "Test")):
        ax.text(
            x,
            -0.75,
            text,
            transform=ax.get_yaxis_transform(),
            ha="right",
            fontsize=9.5,
            color=theme["muted"],
        )
    low = min(100 * min(tst.values()), -10)
    ax.set_xlim(low * 1.12, 12)
    ax.set_ylim(len(horizons) - 0.4, -0.9)
    ax.set_yticks(range(len(horizons)), [HORIZON_LABEL[h] for h in horizons])
    ax.tick_params(axis="y", colors=theme["ink"], labelsize=10.5)
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{_num(v, 0, sign=True)} %"))
    ax.spines["bottom"].set_visible(False)
    ax.text(-1.5, -0.75, "peor que la persistencia", ha="right", fontsize=9.5, color=theme["muted"])
    ax.text(1.5, -0.75, "mejor", ha="left", fontsize=9.5, color=theme["muted"])
    handles = [
        Line2D(
            [],
            [],
            marker="o",
            linestyle="",
            markerfacecolor="none",
            markeredgecolor=theme["ink"],
            markeredgewidth=1.8,
            markersize=8,
        ),
        Line2D([], [], marker="o", linestyle="", color=theme["test"], markersize=8),
    ]
    _legend(fig, theme, handles, ["Validación, media de 3 semillas", "Test"])
    return fig


def test_forecast(theme: dict, run: dict) -> Figure:
    """Un modelo final en test: precio real, mediana prevista, intervalo y persistencia."""
    t = _dates(run["t"])
    fig, axes = _figure(theme, 3.2)
    ax = axes[0, 0]
    ax.fill_between(t, run["lo"], run["hi"], color=theme["model"], alpha=0.16, linewidth=0)
    ax.plot(t, run["base"], color=theme["persistence"], linewidth=1.1, linestyle=(0, (4, 3)))
    ax.plot(t, run["real"], color=theme["ink"], linewidth=1.4)
    ax.plot(t, run["pred"], color=theme["model"], linewidth=1.6)
    ax.set_xlim(t[0], t[-1])
    _years_axis(ax, t[0].year + 1, t[-1].year, 1)
    _dollars(ax)
    handles = [
        Line2D([], [], color=theme["ink"], linewidth=1.6),
        Line2D([], [], color=theme["model"], linewidth=1.8),
        Patch(color=theme["model"], alpha=0.16),
        Line2D([], [], color=theme["persistence"], linestyle=(0, (4, 3))),
    ]
    labels = ["Precio real", "Mediana de la red", "Intervalo del 80 %", "Persistencia"]
    _legend(fig, theme, handles, labels)
    return fig


def main() -> None:
    cfg = load_config()
    family = _setup_fonts()
    market = json.loads((WEB_DATA_DIR / "market.json").read_text(encoding="utf-8"))
    explain = json.loads((WEB_DATA_DIR / "explain.json").read_text(encoding="utf-8"))
    run63 = next(r for r in explain["test"] if r["horizon"] == 63)
    builders = {
        "history": lambda th: history(th, market, explain["splits"]),
        "walk-forward": lambda th: walk_forward(th, explain["folds"]["63"], explain["splits"]),
        "forecast": lambda th: forecast_scheme(th, explain["window"], len(cfg["data"]["features"])),
        "skill": lambda th: skill(th, explain["cv"], explain["test"]),
        "test-h63": lambda th: test_forecast(th, run63),
    }
    README_IMG_DIR.mkdir(parents=True, exist_ok=True)
    for name, build in builders.items():
        for mode, theme in THEMES.items():
            out = README_IMG_DIR / f"{name}-{mode}.svg"
            build(theme).savefig(out, format="svg", transparent=True, metadata={"Date": None})
            print(relative(out))
    print(
        f"Tipografía: {family}"
        + ("" if family == "Inter" else f" (Inter no está en {relative(FONTS_DIR)})")
    )


if __name__ == "__main__":
    main()
