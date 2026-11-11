"""Prepara el entorno del proyecto con progreso: make setup (también lo lanza Copier).

    python scripts/setup_env.py                 entorno conda + dependencias + framework
    python scripts/setup_env.py --backend cuda  fuerza el hardware (mac | cuda | cpu | rocm)
    python scripts/setup_env.py --pending       solo lista los valores PENDIENTE y PROVISIONAL

Solo usa la biblioteca estándar, así que funciona con cualquier Python 3 antes de que exista
el entorno. La salida de cada paso va a .setup.log; si algo falla, se muestran sus últimas líneas.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = "oil-rnn"
POETRY_GROUPS = "dev,web"
FRAMEWORK = "PyTorch"
LOG = ROOT / ".setup.log"
CONFIG = ROOT / "configs" / "config.yaml"
FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
TTY = sys.stdout.isatty()


def fmt(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.0f} s"
    return f"{int(seconds // 60)} min {int(seconds % 60):02d} s"


def detect_backend() -> str:
    if platform.system() == "Darwin":
        return "mac"
    return "cuda" if shutil.which("nvidia-smi") else "cpu"


def step(label: str, command: list[str], fatal: bool = True) -> bool:
    """Ejecuta un paso con animación y tiempo; la salida completa va a .setup.log."""
    start = time.monotonic()
    with LOG.open("a", encoding="utf-8") as log:
        log.write(f"\n$ {' '.join(command)}\n")
        log.flush()
        proc = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        stop = threading.Event()

        def spin() -> None:
            i = 0
            while not stop.wait(0.1):
                elapsed = fmt(time.monotonic() - start)
                print(f"\r  {FRAMES[i % len(FRAMES)]} {label}…  {elapsed}  ", end="", flush=True)
                i += 1

        spinner = threading.Thread(target=spin, daemon=True)
        if TTY:
            spinner.start()
        proc.wait()
        stop.set()
        if TTY:
            spinner.join()
    ok = proc.returncode == 0
    mark = "✓" if ok else ("✗" if fatal else "⚠")
    print(f"\r  {mark} {label}  {fmt(time.monotonic() - start)}".ljust(72))
    if not ok:
        tail = LOG.read_text(encoding="utf-8", errors="replace").splitlines()[-20:]
        print("\n".join(f"      {line}" for line in tail))
        print(f"    Registro completo: {LOG.name}")
        if fatal:
            sys.exit(1)
    return ok


def find_conda() -> str:
    conda = os.environ.get("CONDA_EXE") or shutil.which("conda")
    if not conda:
        sys.exit("No se encuentra conda. Instala Miniconda o Miniforge y abre una terminal nueva.")
    return conda


def env_exists(conda: str) -> bool:
    out = subprocess.run([conda, "env", "list", "--json"], capture_output=True, text=True)
    envs = json.loads(out.stdout or "{}").get("envs", [])
    return any(Path(p).name == ENV for p in envs)


def pending_report() -> tuple[list[str], list[str]]:
    """Claves con valor PENDIENTE y claves (o secciones) marcadas como PROVISIONAL."""
    pending, provisional, stack = [], [], []
    for line in CONFIG.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^(\s*)([A-Za-z_][\w-]*):\s*(.*)$", line)
        if not match:
            continue
        indent, key, rest = len(match[1]), match[2], match[3]
        while stack and stack[-1][0] >= indent:
            stack.pop()
        stack.append((indent, key))
        path = ".".join(k for _, k in stack)
        value, _, comment = rest.partition("#")
        if value.strip() == "PENDIENTE":
            pending.append(path)
        if "PROVISIONAL" in comment:
            provisional.append(path if value.strip() else f"{path}.*")
    return pending, provisional


def print_pending() -> None:
    pending, provisional = pending_report()
    if pending:
        print("\nPendiente de decidir (los comandos que lo usan se paran):")
        print("\n".join(f"  · {k}" for k in pending))
    if provisional:
        print("Provisional (vale para una prueba de humo, no está decidido):")
        print("\n".join(f"  · {k}" for k in provisional))
    print(f"\nTodo en {CONFIG.relative_to(ROOT)}. Para volver a verlo: make pending")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--backend", choices=["mac", "cuda", "cpu", "rocm"])
    parser.add_argument("--pending", action="store_true", help="Solo lista lo pendiente")
    args = parser.parse_args()
    if args.pending:
        print_pending()
        return

    backend = args.backend or os.environ.get("BACKEND") or detect_backend()
    conda = find_conda()
    poetry = shutil.which("poetry")
    if not poetry:
        sys.exit("No se encuentra Poetry. Instálalo con: pipx install poetry")
    LOG.write_text(f"setup {time.strftime('%Y-%m-%d %H:%M:%S')} · backend {backend}\n")

    print(f"\nPreparando {ENV} · hardware: {backend}")
    if env_exists(conda):
        print(f"  ✓ Entorno conda {ENV} (ya existía)")
    else:
        create = [conda, "env", "create", "-f", "environment.yml"]
        step(f"Entorno conda {ENV} con Python 3.12", create)
    run = [conda, "run", "-n", ENV]
    step("Dependencias (poetry install)", [*run, poetry, "install", "--with", POETRY_GROUPS])
    if FRAMEWORK:
        step(f"{FRAMEWORK} para {backend}", [*run, "make", f"backend-{backend}"])
    pip_check = [*run, "python", "-m", "pip", "check"]
    step("Comprobación de versiones (pip check)", pip_check, fatal=False)

    print_pending()
    print(f"Siguiente paso: conda activate {ENV}")


if __name__ == "__main__":
    main()
