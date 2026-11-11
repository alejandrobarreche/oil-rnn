"""Obtención de datos: deja en data/raw/ lo indicado en data.source.

    make data

Cada ejecución escribe data/raw/_source.json con el origen, la fecha y el hash de cada archivo,
de modo que siempre se sabe de dónde salió lo que hay en data/raw/.
Con data.source.type: code se usa fetch() de sources.py (script propio o API).
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from .config import PENDING, add_config_args, load_config
from .data import file_sha256
from .paths import RAW_DIR, relative

SOURCE_FILE = RAW_DIR / "_source.json"


def _require(source: dict, key: str) -> str:
    value = source.get(key)
    if not value or value == PENDING:
        raise ValueError(f"Falta data.source.{key} en configs/config.yaml (PENDIENTE)")
    return value


def fetch_code(source: dict, cfg: dict) -> list[Path]:
    """Código propio: fetch() de sources.py devuelve un DataFrame que se guarda en data/raw/."""
    from .sources import fetch

    df = fetch(cfg)
    target = RAW_DIR / source.get("filename", "dataset.csv")
    df.to_csv(target, index=False)
    return [target]


FETCHERS = {"code": fetch_code}


def download(cfg: dict) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    source = cfg["data"]["source"]
    kind = source.get("type")
    if kind not in FETCHERS:
        raise ValueError(
            f"data.source.type={kind} no está disponible en este proyecto: usa "
            f"{' o '.join(FETCHERS)} (para otro origen, escribe fetch() en sources.py)"
        )
    files = FETCHERS[kind](source, cfg)
    record = {
        "source": source,
        "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "files": {relative(p): file_sha256(p) for p in sorted(files)},
    }
    SOURCE_FILE.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return record


def main(argv: list[str] | None = None) -> None:
    parser = add_config_args(argparse.ArgumentParser(description="Descarga los datos en data/raw/"))
    args = parser.parse_args(argv)
    record = download(load_config(args.config, args.overrides))
    for name in record["files"]:
        print(f"  {name}")
    print(f"Origen registrado en {relative(SOURCE_FILE)}")


if __name__ == "__main__":
    main()
