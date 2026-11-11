"""Carga de configuración YAML con sobrescrituras tipo `clave.subclave=valor`."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

from .paths import DEFAULT_CONFIG

PENDING = "PENDIENTE"  # valor de una decisión aún no tomada (ver configs/config.yaml)


def load_config(path: str | Path | None = None, overrides: list[str] | None = None) -> dict:
    path = Path(path) if path else DEFAULT_CONFIG
    cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    for item in overrides or []:
        key, sep, raw = item.partition("=")
        if not sep:
            raise ValueError(f"Sobrescritura inválida '{item}'. Formato: clave.subclave=valor")
        node = cfg
        *parents, last = key.strip().split(".")
        for part in parents:
            node = node.setdefault(part, {})
        node[last] = yaml.safe_load(raw)  # "10" -> 10, "true" -> True, "[1,2]" -> [1, 2]
    return cfg


def get(cfg: dict, key: str, default: Any = None) -> Any:
    """Valor de una clave con puntos, ej. get(cfg, "data.target")."""
    node: Any = cfg
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return node


def require(cfg: dict, *keys: str) -> None:
    """Para con un mensaje claro si alguna clave falta o sigue PENDIENTE."""
    missing = [k for k in keys if get(cfg, k) in (None, PENDING)]
    if missing:
        raise ValueError(
            "Faltan decisiones en configs/config.yaml (valor PENDIENTE): "
            + ", ".join(missing)
            + ". Rellénalas o pruébalas con --set clave=valor. Lista completa: make pending"
        )


def flatten(cfg: dict, prefix: str = "") -> dict[str, Any]:
    """{'a': {'b': 1}} -> {'a.b': 1}. Útil para registrar parámetros."""
    out: dict[str, Any] = {}
    for key, value in cfg.items():
        full = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(flatten(value, f"{full}."))
        else:
            out[full] = value
    return out


def add_config_args(parser: argparse.ArgumentParser) -> argparse.ArgumentParser:
    parser.add_argument(
        "--config", default=None, help="Ruta al YAML (por defecto configs/config.yaml)"
    )
    parser.add_argument(
        "--set",
        dest="overrides",
        action="append",
        default=[],
        metavar="CLAVE=VALOR",
        help="Sobrescribe un valor, ej. --set seed=7 (se puede repetir)",
    )
    return parser
