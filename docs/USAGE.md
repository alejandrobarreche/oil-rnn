# Guía de uso

**Finalidad**: todos los comandos del proyecto, por fases y por tareas.
**Cuándo usarla**: para instalar, preparar datos, entrenar, evaluar, publicar la web o resolver una tarea concreta.
**Resultado**: el comando exacto de cada paso y lo que produce.
**Flujo**: Instalar → Configurar → Datos → Validar y entrenar → Evaluar → Web → Publicar · Calidad y explorador en cualquier momento

## 1. Instalar: entorno conda, dependencias y PyTorch

### 1.1 Instalar desde cero
- **Requisitos**: *conda*, `make`, *Poetry* ≥ 2 y *Node.js* 22 para la web.

```bash
git clone https://github.com/alejandrobarreche/oil-rnn.git
cd oil-rnn
make setup
conda activate oil-rnn
make device
```

- **`make setup`**: crea el entorno conda e instala todo; muestra cada paso con su tiempo y guarda la salida completa en `.setup.log`.
- **`make device`**: indica qué hardware ve PyTorch.

### 1.2 Elegir la compilación de PyTorch
`make install` detecta el hardware:

| Máquina | Compilación |
|---|---|
| Mac (Apple Silicon o Intel) | `mac` |
| Windows o Linux con GPU NVIDIA (`nvidia-smi` disponible) | `cuda` |
| Windows o Linux sin GPU | `cpu` |
| Linux con GPU AMD | No se detecta; usar `make install-rocm` |

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

## 2. Configurar parámetros del proyecto

Todos los parámetros están en `configs/config.yaml`. Cada valor es del tipo:

- **`PENDIENTE`**: Decisión aún no tomada. El comando que la necesita se detiene y dice cuál falta.
- **`PROVISIONAL`**: Valor de partida para una prueba de humo. Funciona, pero no es definitivo.
- **`SIN MARCA`**: Valor fijo.

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

- **`make data`**: descarga en *data/raw/* y registra origen y hashes en *data/raw/_source.json*.
- **`make prepare`**: crea *data/train*, *data/val*, *data/test* y *data/splits.json*.

## 4. Validar y entrenar: walk-forward, calibración y modelo final

```bash
make cv NAME=<nombre>
make train NAME=<nombre> CALIB=<run_id de make cv>
```

- **`make cv`**: valida con 4 pliegues walk-forward (2015–2023). Guarda las métricas por pliegue y su media.
- **`make train`**: entrena el modelo final con train + val. Con CALIB=<run de make cv> aplica esa corrección, siempre que la configuración coincida.

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

- **Repositorio**: https://alejandrobarreche.github.io/oil-rnn/
- **Modelos**: Están en una Release de GitHub.

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

### 9.0 Entender el proceso

```bash
make explore-install
make explore
```

- **`make explore-install`**: instala Streamlit
- **`make explore`**: abre http://localhost:8501
- **Requisitos**: `make data` y `make prepare` hechos en esa máquina.

### 9.1 Entrenar con otros parámetros

```bash
make train NAME=<nombre> ARGS="--set data.window=<n> --set model.cell=<rnn|lstm|gru>"
```

```bash
make train NAME=<nombre> ARGS="--set train.epochs=<n> --set train.learning_rate=<lr>"
```

### 9.2 Comparar RNN, LSTM y GRU

```bash
make sweep ARGS="--dry-run"
make sweep
make compare
```

- **`make sweep ARGS="--dry-run"`**: lista las combinaciones que faltan de la rejilla (`sweep` en `configs/config.yaml`).
- **`make sweep`**: lanza un `make cv` por combinación. Si se corta, se repite y salta las terminadas.
- **`make compare`**: muestra la mejor configuración por red y horizonte según `cv_<sweep.select_by>`. Con `ARGS="--all"`, todas.
- **Otra rejilla**: con otro prefijo, por ejemplo `make sweep ARGS="--set seed=7 --set sweep.prefix=g1s7"`.

Comparar con referencias:

```bash
make dm
make naive-futures
```

- **`make dm`**: contraste de Diebold-Mariano de cada modelo final frente a la persistencia, en test. Solo informa; no decide nada.
- **`make naive-futures`**: referencia «ingenuo con futuros» en los bloques de `make cv`: el último spot actualizado con el futuro del Brent. No usa test.

### 9.3 Evaluar un run concreto

```bash
make evaluate RUN=<run_id>
```

- **Test**: solo para la evaluación final. Para decidir se usan las métricas `cv_*`.

### 9.4 Trabajar con dos ordenadores
- **Código**: se cambia en cualquiera de los dos.
- **Entrenamientos**: en el de GPU.
- **Commits**: código y runs van por separado.
- **Diferencias entre máquinas**: en `.env` (plantilla en `.env.example`).

Tras cambiar código, en cualquiera:

```bash
make test
make lint
git add <archivos>
git commit -m "<mensaje>"
git pull --rebase
git push
```

Tras entrenar, en el de GPU:

```bash
git pull --rebase
make train NAME=<nombre>
git add runs/<run_id> artifacts/<run_id>
git commit -m "<mensaje>"
git pull --rebase
git push
```

Para ver los resultados, en el otro:

```bash
git pull --rebase
```

### 9.5 Mover pesos entre máquinas

```bash
make pack RUN=<run_id>
make unpack ZIP=<run_id>.run.zip
```

- **`make pack`**: en la máquina de origen, crea `<run_id>.run.zip` con `runs/`, `artifacts/` y `models/` del run.
- **`make unpack`**: en la de destino, lo descomprime.
- **Por qué**: los pesos (`models/`) no van a git.

### 9.6 Compartir MLflow entre máquinas

```bash
mlflow server --host 0.0.0.0
```

```text
MLFLOW_TRACKING_URI=http://<ip>:5000
```

- **Servidor**: la máquina que reúne los runs lanza `mlflow server`.
- **Resto**: añaden la línea `MLFLOW_TRACKING_URI` a su `.env`.
- **Sin servidor**: cada máquina guarda en su `runs/mlflow.db`.

### 9.7 Añadir una dependencia

```bash
poetry add <paquete>
```

- **Antes**: activar el entorno `oil-rnn`.
- **Después**: subir `pyproject.toml` y `poetry.lock`, y en la otra máquina ejecutar `make install`.
- **PyTorch**: no se añade así; su versión se fija en el `Makefile`.

### 9.8 Configurar PyCharm
*Settings → Python Interpreter → Add Interpreter → Conda Environment →* `oil-rnn`.

### 9.9 Actualizar la bibliografía
- **Archivo**: `docs/references.bib`, editado a mano; no se usa Zotero.
- **Añadir**: pegar el BibTeX (de la editorial o de doi.org) con la clave `<apellido><año>`, por ejemplo `diebold1995`.
- **Citar**: solo artículos que estén en el archivo.
