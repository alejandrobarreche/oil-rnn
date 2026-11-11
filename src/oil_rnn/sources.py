"""Origen de datos: `make data` llama a fetch() porque data.source.type es code.

Series diarias (días hábiles) desde data.source.start:
- FRED (EIA, BCE, Fed, Cboe): CSV público, sin clave.
- Yahoo Finance (futuros y mercados mundiales), con yfinance.

fetch() solo descarga y une; no rellena huecos. El relleno (ffill) y el corte en la última
observación real del target se hacen en `make prepare` (data.py), para que data/raw/ conserve
los datos tal como los publica cada fuente. Las series y fechas están en configs/config.yaml.
"""

from __future__ import annotations

import pandas as pd

FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def _fred(series: str, name: str, start: str, end: str | None) -> pd.Series:
    """Una serie de FRED. FRED marca los días sin dato con «.»."""
    params = f"?id={series}&cosd={start}" + (f"&coed={end}" if end else "")
    s = pd.read_csv(FRED_URL + params, index_col=0, parse_dates=True, na_values=".").iloc[:, 0]
    return s.rename(name)


def _yahoo(tickers: dict[str, str], fields: list[str], start: str, end: str | None):
    """Columnas `fields` de cada ticker: <columna>_<campo>, o <columna> si solo hay un campo."""
    import yfinance as yf

    df = yf.download(
        list(tickers.values()), start=start, end=end, auto_adjust=False, progress=False
    )
    if df.empty:
        raise RuntimeError(f"Yahoo Finance no devolvió datos para {list(tickers.values())}")
    out = {}
    for name, ticker in tickers.items():
        for field in fields:
            col = name if len(fields) == 1 else f"{name}_{field.lower()}"
            out[col] = df[(field, ticker)]
    return pd.DataFrame(out)


def fetch(cfg: dict) -> pd.DataFrame:
    """Descarga las series de data.source y las une por fecha.

    Filas: los días con dato de la columna data.source.calendar (el precio que se modela).
    El resto de columnas queda vacío los días en que su mercado no cotizó.
    """
    source = cfg["data"]["source"]
    start, end = str(source["start"]), source.get("end")  # end null = hasta hoy

    parts = [_fred(series, name, start, end) for name, series in source["fred"].items()]
    if source.get("yahoo_ohlcv"):
        fields = ["Open", "High", "Low", "Close", "Volume"]
        parts.append(_yahoo(source["yahoo_ohlcv"], fields, start, end))
    if source.get("yahoo_close"):
        parts.append(_yahoo(source["yahoo_close"], ["Close"], start, end))

    df = pd.concat(parts, axis=1, join="outer").sort_index()
    df = df[df[source["calendar"]].notna()]
    df.index.name = "date"
    return df.reset_index()
