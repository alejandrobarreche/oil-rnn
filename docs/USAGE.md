# Guía de uso

**Finalidad**: todos los comandos del proyecto, por fases y por tareas, listos para copiar.
**Cuándo usarla**: para instalar, preparar datos, entrenar, evaluar, publicar la web o resolver una tarea concreta.
**Resultado**: el comando exacto de cada paso y lo que produce.
**Flujo**: Instalar → Configurar → Datos → Validar y entrenar → Evaluar → Web → Publicar · Calidad y explorador en cualquier momento

## 0. Antes de empezar: cómo leer los comandos

- **Dónde**: los comandos se ejecutan desde la raíz del repositorio.
- **Bloques**: sin comentarios; los valores que hay que sustituir van entre `<...>`. Se copian y pegan tal cual.
- **Resumen**: `make help` lista todos los comandos.

## 1. Instalar: entorno conda, dependencias y PyTorch

### 1.1 Instalar desde cero
- **Requisitos**: conda (Miniconda o Miniforge), `make`, Poetry ≥ 2 y Node.js 22 para la web.

```bash
git clone https://github.com/alejandrobarreche/oil-rnn.git
cd oil-rnn
make setup
conda activate oil-rnn
make device
```

- **`make setup`**: crea el entorno conda e instala todo; muestra cada paso con su tiempo y guarda la salida completa en `.setup.log`.
- **`make device`**: indica qué hardware ve PyTorch.

### 1.2 Instalar en un entorno ya creado

```bash
conda env create -f environment.yml
conda activate oil-rnn
make install
```

### 1.3 Elegir la compilación de PyTorch
`make install` detecta el hardware:

| Máquina | Compilación |
|---|---|
| Mac (Apple Silicon o Intel) | `mac` |
| Windows o Linux con GPU NVIDIA (`nvidia-smi` disponible) | `cuda` |
| Windows o Linux sin GPU | `cpu` |
| Linux con GPU AMD | No se detecta; usar `make install-rocm` |

Para forzarla:

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

- **Por qué PyTorch no está en `poetry.lock`**: cada máquina necesita una compilación distinta. Su versión se fija en el `Makefile` y la instala pip después de `poetry install`.

## 2. Configurar: valores pendientes, provisionales y fijos

Todos los parámetros están en `configs/config.yaml`. Cada valor es de uno de estos tipos:

- **`PENDIENTE`**: decisión aún no tomada. El comando que la necesita se detiene y dice cuál falta.
- **`PROVISIONAL`**: valor de partida para una prueba de humo. Funciona, pero no es definitivo.
- **Sin marca**: valor fijo.

Listar los valores pendientes y provisionales:

```bash
make pending
```

Probar un valor sin editar el archivo:

```bash
make prepare ARGS="--set data.target=<columna>"
```

## 3. Datos: descarga y splits

```bash
make data
make prepare
```

- **`make data`**: descarga en `data/raw/` y registra origen y hashes en `data/raw/_source.json`.
- **`make prepare`**: crea `data/train`, `data/val`, `data/test` y `data/splits.json`.
- **`data/raw/`**: no se modifica a mano.

## 4. Validar y entrenar: walk-forward, calibración y modelo final

```bash
make cv NAME=<nombre>
make train NAME=<nombre> CALIB=<run_id de make cv>
```

### 4.1 Validar con `make cv`
- **Pliegues**: uno por cada bloque de 2 años de train + val (4 pliegues, 2015–2023).
- **Cada pliegue**: entrena con todo lo anterior a su bloque, purgado `data.horizon` filas, y usa el último año para early stopping.
- **Métricas**: por pliegue (`fold<k>_*`) y su media (`cv_*`). Con estas métricas se comparan modelos.
- **Predicciones**: las de los bloques, en `artifacts/<id>/cv_predictions.csv`.
- **Calibración conforme del intervalo del 80 %**: mide su cobertura corrigiendo cada pliegue solo con los anteriores (`cv_coverage_cqr`). Guarda la corrección de los cuatro bloques en `runs/<id>/conformal.json`.

### 4.2 Entrenar el modelo final con `make train`
- **Datos**: train + val, por el mismo procedimiento.
- **`CALIB=<run de make cv>`**: aplica esa corrección, siempre que la configuración coincida.
- **Después**: se evalúa en test con `make evaluate`.

### 4.3 Runs
- **Id**: `<AAAAMMDD-HHMMSS>_<nombre>_<máquina>`, que nombra tres carpetas: `runs/<id>`, `artifacts/<id>` y `models/<id>`.
- **Inmutables**: un run terminado no se reescribe; un cambio es un run nuevo.

## 5. Evaluar y comparar: test, tabla de runs y MLflow

```bash
make evaluate
make runs
make mlflow-ui
```

- **`make evaluate`**: evalúa el último run sobre `test` con la configuración guardada en el propio run.
- **`make runs`**: muestra la tabla de runs.
- **`make mlflow-ui`**: abre MLflow en `http://127.0.0.1:5000`.

## 6. Web: exportar, probar y servir

```bash
make export-web
make web-test
make web-dev
```

- **`make export-web`**: exporta los modelos de `web.models` en `configs/config.yaml`, uno por horizonte.
  - `web/public/model/`: `h<h>.onnx`, `manifest.json`, `examples.json`.
  - `web/public/data/`: `market.json` (histórico y últimas filas) y `quality.json` (métricas de test y backtest).
- **`make web-test`**: comprueba que TypeScript y Python dan la misma salida.
- **`make web-dev`**: sirve la web en `http://localhost:5173`.

Compilar:

```bash
make web-build
```

## 7. Publicar: GitHub Pages y Release de modelos

- **Dirección**: https://alejandrobarreche.github.io/oil-rnn/ (repositorio público, *Settings → Pages → Source: GitHub Actions*).
- **Modelos**: no están en git, sino en una Release de GitHub.

### 7.1 Publicar modelos nuevos
Si cambian los modelos (`web.models` en `configs/config.yaml`), con una Release nueva:

```bash
make export-web RELEASE=<model-v2>
make web-test
make web-release RELEASE=<model-v2>
git add web/public configs/config.yaml
git commit -m "feat(web): <qué cambia>"
git push
```

- **`make web-release`**: necesita el CLI `gh` autenticado (`gh auth login`).

### 7.2 Publicar solo cambios de código
- **Basta con el push**: cada push a `main` que toque `web/` lanza `.github/workflows/pages.yml`.
- **Qué hace el workflow**: descarga los `h<h>.onnx` de la Release que indica `manifest.json`, comprueba su SHA-256, pasa la prueba de paridad y publica.

## 8. Calidad: tests, lint, formato y bloqueo

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

## 9. Tareas: casos frecuentes fuera del flujo principal

### 9.0 Entender el proceso: decisiones, cuadernos y explorador
- **Decisiones**: `docs/DECISIONES.md` reúne cada decisión con su motivo, su comprobación y su valoración.
- **Cuadernos**: `notebooks/02_proceso_del_dato`, `03_validacion`, `04_modelos` y `05_resultados`. Se abren con el kernel del entorno `oil-rnn`.
- **Explorador**: las mismas figuras, con controles. Solo lee `data/`, `runs/` y `artifacts/`.

```bash
make explore-install
make explore
```

- **`make explore-install`**: instala Streamlit, del grupo opcional `explore`. Solo hace falta una vez.
- **`make explore`**: abre http://localhost:8501; se para con Ctrl+C.
- **Requisitos**: `make data` y `make prepare` hechos en esa máquina.

### 9.1 Entrenar con otros parámetros

```bash
make train NAME=<nombre> ARGS="--set data.window=<n> --set model.cell=<rnn|lstm|gru>"
```

```bash
make train NAME=<nombre> ARGS="--set train.epochs=<n> --set train.learning_rate=<lr>"
```

### 9.2 Comparar RNN, LSTM y GRU
Las tres celdas con los mismos datos, ventana, pliegues y rejilla de hiperparámetros (sección `sweep` de `configs/config.yaml`), un `make cv` por combinación.

Ver las combinaciones pendientes:

```bash
make sweep ARGS="--dry-run"
```

Lanzarlas; si se interrumpe, se repite y salta las terminadas:

```bash
make sweep
```

Mejor configuración por red y horizonte (`cv_<sweep.select_by>`), o todas:

```bash
make compare
```

```bash
make compare ARGS="--all"
```

Contraste de Diebold-Mariano de cada modelo final frente a la persistencia, sobre sus predicciones en test (no decide nada; solo lee `artifacts/*_final-*/predictions_test.csv`):

```bash
make dm
```

Referencia «ingenuo con futuros» en los bloques de validación de `make cv` (último spot actualizado con el futuro del Brent de los `cv.naive_futures.lags` días siguientes; no usa test):

```bash
make naive-futures
```

- **Repetir la rejilla con otro valor fijo**: se cambia el prefijo, por ejemplo `make sweep ARGS="--set seed=7 --set sweep.prefix=g1s7"`.

### 9.3 Evaluar un run concreto

```bash
make evaluate RUN=<run_id>
```

- **Uso de test**: solo en la evaluación final. Para decidir arquitectura o hiperparámetros se usan las métricas `cv_*` de `make cv`.

### 9.4 Trabajar con dos ordenadores
- **Reparto**: el código se puede cambiar en cualquiera de los dos; los entrenamientos se lanzan en el de GPU.
- **Commits**: los cambios de código y los runs van en commits separados.
- **Diferencias entre máquinas** (ruta de datos, nombre del ordenador): van en `.env`; hay una plantilla en `.env.example`.

Tras cambiar código o configuración, en cualquiera de los dos:

```bash
make test
make lint
git add <archivos>
git commit -m "<mensaje>"
git pull --rebase
git push
```

En el de GPU, tras un entrenamiento, solo se sube el run:

```bash
git pull --rebase
make train NAME=<nombre>
git add runs/<run_id> artifacts/<run_id>
git commit -m "<mensaje>"
git pull --rebase
git push
```

En el otro, para analizar los resultados:

```bash
git pull --rebase
```

### 9.5 Mover pesos entre máquinas
Los pesos (`models/`) no van a git. En la máquina de origen:

```bash
make pack RUN=<run_id>
```

En la de destino:

```bash
make unpack ZIP=<run_id>.run.zip
```

### 9.6 Compartir MLflow entre máquinas
MLflow guarda en `runs/mlflow.db` de cada máquina. Para verlos todos en un único sitio, en la máquina que actúa de servidor:

```bash
mlflow server --host 0.0.0.0
```

Y en el `.env` de las demás:

```text
MLFLOW_TRACKING_URI=http://<ip>:5000
```

### 9.7 Añadir una dependencia
Con el entorno activo:

```bash
poetry add <paquete>
```

Se suben `pyproject.toml` y `poetry.lock`. En la otra máquina:

```bash
make install
```

### 9.8 Configurar PyCharm
*Settings → Python Interpreter → Add Interpreter → Conda Environment →* `oil-rnn`.

### 9.9 Actualizar la bibliografía
- **`docs/references.bib`**: se edita a mano; no se usa Zotero.
- **Añadir un artículo**: se pega su BibTeX (lo da la editorial o doi.org) con la clave `<apellido><año>`, por ejemplo `diebold1995`.
- **Citar**: solo artículos que estén en el archivo.
