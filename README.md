# oil-rnn



| | |
|---|---|
| Modelo | Red neuronal en PyTorch · recurrente (RNN/LSTM/GRU) |
| Datos | Serie temporal · regresión |
| Entorno | Python 3.12 · conda `oil-rnn` · Poetry · MLflow |
| Web | Estática con el modelo en el navegador (Vite + TypeScript + ONNX Runtime Web) |

---

## Instalación

Requisitos: [conda](https://docs.conda.io) (Miniconda o Miniforge), `make`, [Poetry](https://python-poetry.org) ≥ 2 (`pipx install poetry`) y Node.js 22 para la web.

```bash
git clone <url-del-repo> && cd oil-rnn
make setup                  # crea el entorno conda oil-rnn e instala todo, con progreso
conda activate oil-rnn
make device                 # comprueba qué hardware ve el framework
```

`make setup` muestra cada paso con su tiempo y guarda la salida completa en `.setup.log`; si algo falla, enseña las últimas líneas. Alternativa manual: `conda env create -f environment.yml`, `conda activate oil-rnn` y `make install`.

`make install` detecta el hardware y elige la instalación adecuada:

| Ordenador | Se detecta como | Forzarlo |
|---|---|---|
| Mac (Apple Silicon / Intel) | `mac` | `make install-mac` |
| Windows o Linux con GPU NVIDIA (`nvidia-smi` disponible) | `cuda` | `make install-cuda` |
| Windows o Linux sin GPU | `cpu` | `make install-cpu` |
| Linux con GPU AMD | — | `make install-rocm` |

PyTorch no está en `poetry.lock` porque cada máquina necesita una compilación distinta. Su versión se fija en el `Makefile` y la instala pip después de `poetry install`. El resto de dependencias son idénticas en todas las máquinas gracias a `poetry.lock`.

**PyCharm:** *Settings → Python Interpreter → Add Interpreter → Conda Environment →* `oil-rnn`.

**Añadir una dependencia:** `poetry add <paquete>` con el entorno activo, y se suben `pyproject.toml` y `poetry.lock`. En la otra máquina basta con `make install`.

---

## Flujo de trabajo

```bash
make data                       # 1. descarga los datos en data/raw/ (y registra su origen)
make prepare                    # 2. crea data/train, data/val y data/test
make train NAME=baseline        # 3. entrena: cada ejecución es un run con id propio
make evaluate                   # 4. evalúa el último run sobre test
make runs                       # 5. compara runs
make mlflow-ui                  #    o en MLflow: http://127.0.0.1:5000
```

Para variar un parámetro sin tocar la configuración:

```bash
make train NAME=prueba ARGS="--set data.window=60 --set model.cell=rnn"
```

`make help` lista todos los comandos.

### Decisiones pendientes

`configs/config.yaml` distingue tres tipos de valor:

| Marca | Significado | Comportamiento |
|---|---|---|
| `PENDIENTE` | Decisión del proyecto aún no tomada (target, features, tamaños de los splits, ventana, horizonte…) | El comando que la necesita se para y dice cuál falta |
| `PROVISIONAL` | Valor de partida (arquitectura, entrenamiento) | Funciona para una prueba de humo, pero no está decidido |
| sin marca | Fijo | — |

`make pending` lista las dos primeras. Para probar un valor sin escribirlo: `--set data.target=columna`.

Los datos se obtienen con `fetch()` en `src/oil_rnn/sources.py`; su docstring explica cómo adaptar un script ya hecho.

---

## Estructura

```text
oil-rnn/
├── configs/config.yaml       configuración por defecto; cada run guarda su copia
├── data/                     no se versiona
│   ├── raw/                  datos originales, nunca se modifican (+ _source.json: origen y hashes)
│   ├── interim/ external/    pasos intermedios y datos de terceros
│   ├── train/ val/ test/     splits creados por make prepare
│   └── splits.json           cómo se hicieron los splits y hash de cada uno
├── runs/<run_id>/            registro del run: config, meta, métricas, log (se versiona)
├── artifacts/<run_id>/       gráficas y predicciones (se versiona)
├── models/<run_id>/          pesos y preprocesado (no se versiona) · LATEST = último run
├── notebooks/01_eda.ipynb     exploración solo con train; importa el paquete
├── src/oil_rnn/
│   ├── paths.py              todas las rutas
│   ├── config.py             YAML + --set clave=valor
│   ├── download.py           make data
│   ├── data.py               make prepare y carga de splits
│   ├── features.py           preprocesado (se ajusta solo con train)
│   ├── model.py              construir, entrenar, guardar, cargar (Predictor)
│   ├── metrics.py            métricas y gráficas
│   ├── run.py                une runs/, models/, artifacts/ y MLflow
│   └── train.py · evaluate.py · runs_cli.py · export_web.py
├── web/                      aplicación web
├── docs/                     assignment/ (enunciado) · references.bib (Zotero) · presentation/
├── scripts/setup_env.py      make setup: entorno conda + dependencias, con progreso
├── tests/
├── .github/workflows/        ci.yml (make test y make lint en cada push) · pages.yml
├── environment.yml           entorno conda (Python 3.12)
├── pyproject.toml · poetry.lock
└── Makefile
```

### Relación entre carpetas

- Un **run_id** (`20261111-142530_baseline_mac`: fecha, nombre y ordenador) da nombre a `runs/<id>`, `models/<id>` y `artifacts/<id>`, y al run de MLflow.
- `runs/<id>/meta.json` registra el commit de git, la máquina, la versión de Python y el **hash de los datos** usados.
- `evaluate` usa la configuración guardada en el run, no la actual, y avisa si los datos cambiaron desde el entrenamiento.
- `test` solo se usa en `make evaluate`: ninguna decisión (arquitectura, hiperparámetros, umbral) se toma mirando test.
- Cada métrica va acompañada de su referencia trivial (`baseline_*`): persistencia, es decir, el último valor conocido. `skill_vs_baseline ≤ 0` significa que el modelo no la mejora.

---

## Serie temporal

- **Splits cronológicos:** train, val y test son tramos consecutivos y no se mezclan, de modo que el modelo nunca entrena con datos posteriores a los que se evalúan.
- **Ventanas:** para predecir el valor del instante *t* la red recibe las `window` filas que terminan en *t − horizon*. Las primeras ventanas de val y test usan como historia el final del tramo anterior, pero esa historia no se evalúa.
- **`target_mode: change`:** la red predice el cambio respecto al último valor conocido. En series que se salen del rango visto en train (precios) suele generalizar mejor que predecir el valor directamente.
- **Referencia de persistencia:** la referencia trivial de una serie es predecir «el último valor conocido».

---

## Trabajo con dos ordenadores

Un ordenador para desarrollar (por ejemplo, Mac) y otro para entrenar con GPU (por ejemplo, Windows con NVIDIA):

1. **Desarrollo:** se cambia el código o la configuración, `make test` y `make lint` en verde, commit y push.
2. **Entrenamiento:** `git pull --rebase`, `make train NAME=...`, y se sube solo el run: `git add runs/<id> artifacts/<id>`, commit, `git pull --rebase`, push.
3. **Desarrollo:** `git pull --rebase` y análisis de los resultados.

Los pesos (`models/`) no van a git. Para llevarlos a otra máquina: `make pack RUN=<id>` y, en la otra, `make unpack ZIP=<id>.run.zip`.
MLflow guarda en `runs/mlflow.db` de cada máquina. Para ver todos los runs en un único sitio, levanta `mlflow server --host 0.0.0.0` en una máquina y pon `MLFLOW_TRACKING_URI=http://<ip>:5000` en el `.env` de las demás.
Lo que cambie entre máquinas (ruta de datos, nombre del ordenador) va en `.env` (ver `.env.example`).

---

## Aplicación web

`web/` es una página estática: el modelo se ejecuta en el navegador con ONNX Runtime Web y los datos no salen del equipo.

```bash
make export-web                 # último run → web/public/model/ (model.onnx, manifest.json, examples.json)
make web-test                   # paridad: TypeScript y Python dan la misma salida
make web-dev                    # http://localhost:5173
```

El preprocesado de `features.py` se replica en `web/src/model.ts` con los parámetros del manifiesto; `make web-test` lo comprueba con los ejemplos que exporta Python.

**Publicación en GitHub Pages** (`.github/workflows/pages.yml`):

1. *Settings → Pages → Source: GitHub Actions* (una vez).
2. `make web-release RELEASE=model-v1` sube `model.onnx` como Release (el modelo no está en git).
3. Se suben `web/` (con `manifest.json`, `examples.json` y `package-lock.json`). Cada push a `main` que toque `web/` descarga el modelo de la Release, comprueba su SHA-256, pasa la prueba de paridad y publica.

---

## Bibliografía

`docs/references.bib` es la única fuente de citas. Se mantiene con Zotero y la extensión Better BibTeX: clic derecho en la colección del proyecto → *Exportar colección* → formato *Better BibTeX*, marcando *Mantener actualizado*, y como destino `docs/references.bib`. A partir de ahí, cada artículo que se añade a la colección aparece en el archivo.

---

## Calidad

```bash
make test                       # pytest
make lint                       # ruff check + ruff format --check
make format                     # aplica el formato
```
