"""Comparativa RNN · LSTM · GRU (fase 3): rejilla de make cv y tabla de resultados.

make sweep                          lanza las combinaciones de `sweep` que falten (reanudable)
make sweep ARGS="--dry-run"         solo las lista
make compare                        mejor configuración por red y horizonte (sweep.select_by)
make compare ARGS="--all"           todas las combinaciones terminadas

Cada combinación es un `make cv` independiente (un proceso por run: en Windows+CUDA el proceso
termina con TerminateProcess, ver run.finish_process). Su nombre la identifica, así que una
rejilla interrumpida se reanuda saltando las que ya tienen un run terminado. Para repetir la
rejilla con otro valor fijo (por ejemplo, otra semilla) se cambia el prefijo:
make sweep ARGS="--set seed=7 --set sweep.prefix=g1s7".
"""

from __future__ import annotations

import argparse
import itertools
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import yaml

from .config import add_config_args, load_config, require
from .paths import RUNS_DIR


def combinations(cfg: dict) -> list[tuple[str, list[str]]]:
    """(nombre, sobrescrituras --set) de cada combinación de la rejilla."""
    s = cfg["sweep"]
    out = []
    grid = itertools.product(
        s["cells"], s["horizons"], s["hidden_size"], s["depth"], s["learning_rate"]
    )
    for cell, h, hidden, (layers, dropout), lr in grid:
        name = f"{s['prefix']}-{cell}-h{h}-n{hidden}-l{layers}-d{dropout:g}-lr{lr:g}"
        sets = {
            "model.cell": cell,
            "data.horizon": h,
            "model.hidden_size": hidden,
            "model.num_layers": layers,
            "model.dropout": dropout,
            "train.learning_rate": lr,
        }
        out.append((name, [f"{k}={v}" for k, v in sets.items()]))
    return out


def finished_runs(prefix: str) -> dict[str, Path]:
    """Nombre → carpeta de los runs terminados cuyo nombre empieza por `<prefix>-`."""
    found = {}
    for meta_path in sorted(RUNS_DIR.glob("*/meta.json")):
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        name = meta.get("name", "")
        if name.startswith(f"{prefix}-") and meta.get("status") == "finished":
            found[name] = meta_path.parent
    return found


def run_sweep(cfg: dict, overrides: list[str], dry_run: bool) -> None:
    combos = combinations(cfg)
    done = finished_runs(cfg["sweep"]["prefix"])
    todo = [(n, s) for n, s in combos if n not in done]
    print(f"Rejilla {cfg['sweep']['prefix']}: {len(combos)} combinaciones, {len(todo)} por hacer")
    if dry_run:
        for name, _ in todo:
            print(" ", name)
        return
    failed = []
    for i, (name, sets) in enumerate(todo, 1):
        print(f"\n[{i}/{len(todo)}] {name}", flush=True)
        cmd = [sys.executable, "-m", "oil_rnn.cv", "--name", name]
        for item in [*overrides, *sets]:  # las de la rejilla mandan
            cmd += ["--set", item]
        if subprocess.run(cmd, check=False).returncode != 0:
            failed.append(name)
    print(f"\nTerminadas {len(todo) - len(failed)} de {len(todo)}.")
    if failed:
        print("Fallidas (se repiten con el mismo comando):", *failed, sep="\n  ")
        sys.exit(1)


def _gap_at_best_epoch(run_dir: Path, folds: int) -> float:
    """Media por pliegue de val_loss − train_loss en la época elegida por early stopping."""
    summary = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
    history: dict[tuple[int, int], dict] = {}
    for line in (run_dir / "metrics.jsonl").read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        for k in range(1, folds + 1):
            if f"fold{k}_train_loss" in row and row.get("step") is not None:
                history[(k, row["step"])] = row
    gaps = []
    for k in range(1, folds + 1):
        row = history.get((k, int(summary[f"fold{k}_best_epoch"])))
        if row:
            gaps.append(row[f"fold{k}_val_loss"] - row[f"fold{k}_train_loss"])
    return float(np.mean(gaps)) if gaps else float("nan")


def collect(cfg: dict) -> list[dict]:
    """Una fila por run terminado de la rejilla: configuración y métricas de cv."""
    rows = []
    folds = int(cfg["cv"]["folds"])
    for name, run_dir in finished_runs(cfg["sweep"]["prefix"]).items():
        run_cfg = yaml.safe_load((run_dir / "config.yaml").read_text(encoding="utf-8"))
        m = json.loads((run_dir / "metrics.json").read_text(encoding="utf-8"))
        if "cv_pinball" not in m:
            continue
        rows.append(
            {
                "run": run_dir.name,
                "name": name,
                "cell": run_cfg["model"]["cell"],
                "h": int(run_cfg["data"]["horizon"]),
                "n": run_cfg["model"]["hidden_size"],
                "l": run_cfg["model"]["num_layers"],
                "d": run_cfg["model"]["dropout"],
                "lr": run_cfg["train"]["learning_rate"],
                "params": int(m["fold1_n_params"]),
                "seconds": sum(m[f"fold{k}_train_seconds"] for k in range(1, folds + 1)),
                "epoch": np.mean([m[f"fold{k}_best_epoch"] for k in range(1, folds + 1)]),
                "gap": _gap_at_best_epoch(run_dir, folds),
                **{k.removeprefix("cv_"): v for k, v in m.items() if k.startswith("cv_")},
            }
        )
    return rows


def print_table(rows: list[dict], key: str) -> None:
    cols = [
        ("cell", "red", "{:<5}"),
        ("h", "h", "{:>4}"),
        ("n", "oculto", "{:>6}"),
        ("l", "capas", "{:>5}"),
        ("d", "drop", "{:>5}"),
        ("lr", "lr", "{:>7g}"),
        (key, key, "{:>11.4f}"),
        ("pinball_skill", "pinb_skill", "{:>+10.4f}"),
        ("mae", "mae", "{:>8.3f}"),
        ("baseline_mae", "mae_pers", "{:>8.3f}"),
        ("rmse", "rmse", "{:>8.3f}"),
        ("skill_vs_baseline", "skill_rmse", "{:>+10.4f}"),
        ("direction_accuracy", "dir", "{:>6.3f}"),
        ("coverage_cqr", "cob_cqr", "{:>7.3f}"),
        ("gap", "brecha", "{:>+8.4f}"),
        ("epoch", "epoca", "{:>6.1f}"),
        ("params", "params", "{:>8}"),
        ("seconds", "seg", "{:>6.0f}"),
    ]
    print("  ".join(f"{title:>{len(fmt.format(rows[0][c]))}}" for c, title, fmt in cols))
    for r in rows:
        print("  ".join(fmt.format(r[c]) for c, _, fmt in cols))


def compare(cfg: dict, show_all: bool) -> None:
    key = cfg["sweep"]["select_by"]
    rows = sorted(collect(cfg), key=lambda r: (r["h"], r["cell"], r[key]))
    if not rows:
        print(f"No hay runs terminados de la rejilla {cfg['sweep']['prefix']}.")
        return
    if not show_all:
        best: dict[tuple, dict] = {}
        counts: dict[tuple, int] = {}
        for r in rows:  # ya ordenadas: la primera de cada grupo es la mejor
            group = (r["h"], r["cell"])
            best.setdefault(group, r)
            counts[group] = counts.get(group, 0) + 1
        rows = list(best.values())
        expected = len(combinations(cfg)) // (
            len(cfg["sweep"]["cells"]) * len(cfg["sweep"]["horizons"])
        )
        print(f"Mejor configuracion por red y horizonte segun {key} (media de pliegues de cv)")
        incomplete = [f"{c}-h{h}: {n}/{expected}" for (h, c), n in counts.items() if n < expected]
        if incomplete:
            print("Grupos incompletos:", ", ".join(incomplete))
    print_table(rows, key)
    if not show_all:
        print("\nRuns:", *(f"{r['cell']}-h{r['h']}: {r['run']}" for r in rows), sep="\n  ")
    print(
        "\npinb_skill y skill_rmse: mejora relativa frente a la referencia (cuantiles históricos y"
        " persistencia); > 0 = mejor. brecha: val_loss - train_loss en la epoca elegida."
    )


def main() -> None:
    parser = add_config_args(argparse.ArgumentParser(description="Rejilla de la comparativa"))
    parser.add_argument("--compare", action="store_true", help="Tabla de resultados")
    parser.add_argument("--all", action="store_true", help="Con --compare: todas las filas")
    parser.add_argument("--dry-run", action="store_true", help="Lista las combinaciones pendientes")
    args = parser.parse_args()
    cfg = load_config(args.config, args.overrides)
    require(cfg, "sweep.prefix", "sweep.select_by")
    if args.compare:
        compare(cfg, args.all)
    else:
        run_sweep(cfg, args.overrides, args.dry_run)


if __name__ == "__main__":
    main()
