# Guía de uso

Los comandos se ejecutan desde la raíz del repositorio. Los bloques de código no llevan comentarios y los valores que debes sustituir van entre `<...>`, de modo que se pueden copiar y pegar tal cual. `make help` lista todos los comandos.

**Fases**

1. [Instalación](#1-instalación)
2. [Configuración](#2-configuración)
3. [Datos](#3-datos)
4. [Entrenamiento](#4-entrenamiento)
5. [Evaluación y comparación](#5-evaluación-y-comparación)
6. [Web](#6-web)
7. [Publicación](#7-publicación)
8. [Calidad](#8-calidad)

**Tareas**

- [Entrenar con otros parámetros](#entrenar-con-otros-parámetros)
- [Comparar RNN, LSTM y GRU](#comparar-rnn-lstm-y-gru)
- [Evaluar un run concreto o sobre validación](#evaluar-un-run-concreto-o-sobre-validación)
- [Trabajar con dos ordenadores](#trabajar-con-dos-ordenadores)
- [Mover pesos entre máquinas](#mover-pesos-entre-máquinas)
- [Compartir MLflow entre máquinas](#compartir-mlflow-entre-máquinas)
- [Añadir una dependencia](#añadir-una-dependencia)
- [Configurar PyCharm](#configurar-pycharm)
- [Actualizar la bibliografía](#actualizar-la-bibliografía)

---

## Fases

### 1. Instalación

Requisitos: conda (Miniconda o Miniforge), `make`, Poetry ≥ 2 y Node.js 22 para la web.

```bash
git clone <url-del-repo>
cd oil-rnn
make setup
conda activate oil-rnn
make device
```

`make setup` crea el entorno conda e instala todo; muestra cada paso con su tiempo y guarda la salida completa en `.setup.log`. `make device` indica qué hardware ve PyTorch.

Instalación manual en un entorno ya creado:

```bash
conda env create -f environment.yml
conda activate oil-rnn
make install
```

`make install` detecta el hardware. Para forzarlo:

```bash
make install-mac
```

```bash
make install-cuda
```

```bash
make install-cpu
```

```bash
make install-rocm
```

Detección automática:

- **Mac (Apple Silicon o Intel):** `mac`.
- **Windows o Linux con GPU NVIDIA** (`nvidia-smi` disponible): `cuda`.
- **Windows o Linux sin GPU:** `cpu`.
- **Linux con GPU AMD:** no se detecta; usar `make install-rocm`.

PyTorch no está en `poetry.lock` porque cada máquina necesita una compilación distinta. Su versión se fija en el `Makefile` y la instala pip después de `poetry install`.

### 2. Configuración

Todos los parámetros están en `configs/config.yaml`. Cada valor es de uno de estos tipos:

- **`PENDIENTE`:** decisión aún no tomada. El comando que la necesita se detiene y dice cuál falta.
- **`PROVISIONAL`:** valor de partida para una prueba de humo. Funciona, pero no es definitivo.
- **Sin marca:** valor fijo.

Listar los valores pendientes y provisionales:

```bash
make pending
```

Probar un valor sin editar el archivo:

```bash
make prepare ARGS="--set data.target=<columna>"
```

### 3. Datos

```bash
make data
make prepare
```

`make data` descarga en `data/raw/` y registra origen y hashes en `data/raw/_source.json`. `make prepare` crea `data/train`, `data/val`, `data/test` y `data/splits.json`. `data/raw/` no se modifica a mano.

### 4. Validación y entrenamiento

```bash
make cv NAME=<nombre>
make train NAME=<nombre> CALIB=<run_id de make cv>
```

`make cv` entrena un pliegue por cada bloque de 2 años de train + val (4 pliegues, 2015–2023): cada uno con todo lo anterior a su bloque, purgado `data.horizon` filas y con el último año para early stopping. Registra métricas por pliegue (`fold<k>_*`) y su media (`cv_*`), y guarda las predicciones de los bloques en `artifacts/<id>/cv_predictions.csv`. Con estas métricas se comparan modelos.

`make cv` también calibra el intervalo del 80 % (calibración conforme): mide su cobertura corrigiendo cada pliegue solo con los anteriores (`cv_coverage_cqr`) y guarda la corrección de los cuatro bloques en `runs/<id>/conformal.json`.

`make train` entrena el modelo final con train + val por el mismo procedimiento; con `CALIB=<run de make cv>` aplica esa corrección, siempre que la configuración coincida. Se evalúa en test con `make evaluate`.

Cada ejecución es un run con id `<AAAAMMDD-HHMMSS>_<nombre>_<máquina>` que nombra tres carpetas: `runs/<id>`, `artifacts/<id>` y `models/<id>`. Un run terminado no se reescribe; un cambio es un run nuevo.

### 5. Evaluación y comparación

```bash
make evaluate
make runs
make mlflow-ui
```

`make evaluate` evalúa el último run sobre `test` con la configuración guardada en el propio run. `make runs` muestra la tabla de runs. `make mlflow-ui` abre MLflow en `http://127.0.0.1:5000`.

### 6. Web

```bash
make export-web
make web-test
make web-dev
```

`make export-web` genera `web/public/model/` (`model.onnx`, `manifest.json`, `examples.json`) a partir del último run. `make web-test` comprueba que TypeScript y Python dan la misma salida. `make web-dev` sirve la web en `http://localhost:5173`.

Compilar:

```bash
make web-build
```

### 7. Publicación

Una vez, en GitHub: *Settings → Pages → Source: GitHub Actions*.

```bash
make web-release RELEASE=<model-v1>
```

Después hay que subir `web/` con `manifest.json`, `examples.json` y `package-lock.json`. Cada push a `main` que toque `web/` descarga el modelo de la Release, comprueba su SHA-256, pasa la prueba de paridad y publica (`.github/workflows/pages.yml`). El modelo no está en git.

### 8. Calidad

```bash
make test
make lint
```

Aplicar el formato:

```bash
make format
```

Regenerar el bloqueo de dependencias:

```bash
make lock
```

---

## Tareas

### Entrenar con otros parámetros

```bash
make train NAME=<nombre> ARGS="--set data.window=<n> --set model.cell=<rnn|lstm|gru>"
```

```bash
make train NAME=<nombre> ARGS="--set train.epochs=<n> --set train.learning_rate=<lr>"
```

### Comparar RNN, LSTM y GRU

Los tres modelos con los mismos datos, la misma ventana y la misma partición:

```bash
make cv NAME=rnn ARGS="--set model.cell=rnn"
make cv NAME=lstm ARGS="--set model.cell=lstm"
make cv NAME=gru ARGS="--set model.cell=gru"
make runs
```

### Evaluar un run concreto

```bash
make evaluate RUN=<run_id>
```

`test` solo se usa en la evaluación final; para decidir arquitectura o hiperparámetros se usan las métricas `cv_*` de `make cv`.

### Trabajar con dos ordenadores

Un ordenador para desarrollar (por ejemplo, Mac) y otro para entrenar con GPU.

Desarrollo, tras cambiar código o configuración:

```bash
make test
make lint
git add <archivos>
git commit -m "<mensaje>"
git pull --rebase
git push
```

Entrenamiento, que solo sube su run:

```bash
git pull --rebase
make train NAME=<nombre>
git add runs/<run_id> artifacts/<run_id>
git commit -m "<mensaje>"
git pull --rebase
git push
```

Desarrollo, para analizar los resultados:

```bash
git pull --rebase
```

Lo que cambia entre máquinas (ruta de datos, nombre del ordenador) va en `.env`; hay una plantilla en `.env.example`.

### Mover pesos entre máquinas

Los pesos (`models/`) no van a git. En la máquina de origen:

```bash
make pack RUN=<run_id>
```

En la de destino:

```bash
make unpack ZIP=<run_id>.run.zip
```

### Compartir MLflow entre máquinas

MLflow guarda en `runs/mlflow.db` de cada máquina. Para verlos todos en un único sitio, en la máquina que actúa de servidor:

```bash
mlflow server --host 0.0.0.0
```

Y en el `.env` de las demás:

```text
MLFLOW_TRACKING_URI=http://<ip>:5000
```

### Añadir una dependencia

Con el entorno activo:

```bash
poetry add <paquete>
```

Se suben `pyproject.toml` y `poetry.lock`. En la otra máquina:

```bash
make install
```

### Configurar PyCharm

*Settings → Python Interpreter → Add Interpreter → Conda Environment →* `oil-rnn`.

### Actualizar la bibliografía

`docs/references.bib` no se edita a mano. En Zotero: clic derecho en la colección del proyecto → *Exportar colección* → formato *Better BibTeX*, marcando *Mantener actualizado*, con destino `docs/references.bib`. Cada artículo que se añade a la colección aparece después en el archivo.
