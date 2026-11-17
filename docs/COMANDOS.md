# Chat Mac ↔ Windows

**Finalidad**: registro de los comandos que el usuario ejecuta en cada máquina, con su resultado.
**Cuándo usarlo**: cada vez que Claude da un comando al usuario y cuando el usuario devuelve la salida.
**Resultado**: mensajes en orden cronológico, cada uno con máquina, estado, bloques para copiar y resultado.
**Estado**: todos ✅.

## 0. Antes de empezar: cómo se lee y se escribe este chat

- **Orden**: el mensaje más reciente va al final, con el siguiente número.
- **Título de cada mensaje**: `## N. <Máquina> · <fecha> · <estado>: <qué hace>`.
- **Máquinas**: **Mac**, desarrollo (código, tests, commits de código). **Windows GPU**, entrenamientos; solo sube sus `runs/<id>` y `artifacts/<id>`.
- **Estado**: ✅ hecho · ⏳ pendiente. Cuando ejecutes un mensaje ⏳, pásale la salida a Claude y él lo marca como ✅.
- **Bloques**: se copian tal cual en la terminal de esa máquina.

## 1. Mac · 11/11/2026 · ✅: descargar datos y crear splits

```bash
make data
make prepare
```

- **Resultado**: `data/raw/dataset.csv` con sha256 `fa54aa0a5eaa494c52d4ca2764c7b46961391cdf7e9c0e6e826ace7eb72cf377`; train 4.454 filas (2000-08-30 → 2019-04-22), val 955 (→ 2023-01-24), test 955 (→ 2026-11-03).

## 2. Mac · 11/11/2026 · ✅: subir los commits de la fase 2

Código de los pasos 1–5 y este chat.

```bash
git pull --rebase
git push
```

## 3. Windows GPU · ✅: preparar la máquina con el código y los mismos datos que el Mac

### 3.1 Código y entorno
- **Requisitos**: Miniconda o Miniforge, Git y el driver de NVIDIA al día (`nvidia-smi` debe indicar «CUDA Version» ≥ 12.6).
- **Terminal**: todo en «Anaconda Prompt».

Primera vez (clonar y crear el entorno):

```bash
git clone <url-del-repo>
cd oil-rnn
conda env create -f environment.yml
conda activate oil-rnn
conda install -c conda-forge make
python -m pip install "poetry>=2"
make install-cuda
make device
```

Si ya estaba clonado y con entorno:

```bash
git pull --rebase
conda activate oil-rnn
make device
```

- **Comprobación**: `make device` debe mostrar `CUDA: True` y el nombre de la GPU. Si dice `False`, no sigas.

### 3.2 Copiar los datos del Mac
- **Qué**: `data/raw/dataset.csv` y `data/raw/_source.json`, a la misma ruta, a mano (USB, nube…).
- **Por qué**: `data/` no va a git, y volver a descargar podría dar datos ligeramente distintos.

### 3.3 Crear los splits y comprobar los datos

```bash
make prepare
python -c "import json; print(json.load(open('data/splits.json'))['source']['sha256'])"
```

- **Comprobación**: el hash debe ser `fa54aa0a5eaa494c52d4ca2764c7b46961391cdf7e9c0e6e826ace7eb72cf377`. Si no coincide, no sigas.

### 3.4 Opcional: nombre de la máquina
- **Cómo**: en `.env` (copia de `.env.example`), `MACHINE_NAME=win-gpu`, para que los runs se llamen `<fecha>_<nombre>_win-gpu`.

## 4. Windows GPU · ✅: prueba de humo de la fase 2 (h=5, 3 épocas)

Validación walk-forward y modelo final. Solo comprueba que todo funciona; sus cifras no valen como resultado.

```bash
make cv NAME=humo-h5 ARGS="--set train.epochs=3 --set train.min_epochs=1"
```

Copia el `run_id` que imprime al final (`Run: <run_id>`) y úsalo en `CALIB`:

```bash
make train NAME=humo-h5 CALIB=<run_id de make cv> ARGS="--set train.epochs=3 --set train.min_epochs=1"
```

Pásale a Claude la salida completa de los dos comandos. Después, subir solo los dos runs:

```bash
git add runs/<run_id de cv> artifacts/<run_id de cv> runs/<run_id de train> artifacts/<run_id de train>
git commit -m "chore(runs): prueba de humo de la fase 2 (h=5)"
git pull --rebase
git push
```

## 5. Windows GPU · 11/11/2026 · ✅: sustituir `pyarrow` de pip, bloqueado por Smart App Control

- **Problema**: `make prepare` falla. Windows (Control de aplicaciones / Smart App Control) bloquea la DLL `_parquet` de `pyarrow` instalada por pip.
- **Arreglo propuesto**: sustituirla por la compilación de conda-forge, que es otro binario. En «Anaconda Prompt»:

```bash
conda activate oil-rnn
pip uninstall -y pyarrow
conda install -y -c conda-forge "pyarrow>=17"
python -c "import pyarrow.parquet; print('parquet OK')"
make prepare
python -c "import json; print(json.load(open('data/splits.json'))['source']['sha256'])"
```

- **Si `import pyarrow.parquet` vuelve a dar** «Una directiva de Control de aplicaciones bloqueó este archivo»: no desactives Smart App Control (en Windows 11 no se puede volver a activar sin reinstalar). Pásale a Claude la salida de este comando de PowerShell y se cambia el formato de los splits en el código.

```powershell
Get-MpComputerStatus | Select-Object SmartAppControlState
```

- **Progreso (11/11)**: `pip uninstall` y `conda install` hechos (pyarrow 26.0.1 de conda-forge). Falta desde `import pyarrow.parquet`.
- **Resultado (11/11)**: `import pyarrow` da `ModuleNotFoundError`. En conda-forge, `pyarrow` es un metapaquete sin archivos (0 en `conda-meta`). El código Python está en `pyarrow-core`, que no quedó instalado, y conda dice «already installed». Las DLL `libarrow*` sí están.

## 6. Windows GPU · 11/11/2026 · ✅: instalar `pyarrow-core`; los splits pasan a pickle y se arregla el cierre con cuDNN

### 6.1 Comando
Instalar `pyarrow-core`, la parte de `pyarrow` que contiene el código Python, y repetir la comprobación:

```bash
conda install -y -c conda-forge "pyarrow-core=26.0.1"
python -c "import pyarrow.parquet; print('parquet OK')"
make prepare
python -c "import json; print(json.load(open('data/splits.json'))['source']['sha256'])"
```

- **Comprobación**: el hash debe ser `fa54aa0a5eaa494c52d4ca2764c7b46961391cdf7e9c0e6e826ace7eb72cf377`.
- **Si `import pyarrow.parquet` da** «Una directiva de Control de aplicaciones bloqueó este archivo»: pasa la salida de `Get-MpComputerStatus | Select-Object SmartAppControlState`.

### 6.2 Resultado: splits en pickle (11/11)
- **Bloqueo**: `pyarrow-core` se instala, pero Smart App Control bloquea también su DLL (`pyarrow.lib`).
- **Cambio**: los splits pasan a guardarse como pickle de pandas (`data/<split>/<split>.pkl`), así que ya no hace falta pyarrow.
- **Comprobación**: Claude ejecutó `make prepare` en Windows: el hash coincide (`fa54aa0a…cf377`) y 4454/955/955 filas.

### 6.3 Prueba de humo de la fase 2: DLL bloqueadas una vez (11/11)
- **Fallo**: el primer `make cv` falló porque Smart App Control bloqueó `sqlite3.dll`, que usa MLflow.
- **Registro Code Integrity**: casi todas las DLL bloqueadas (`_sqlite3.pyd`, `sqlite3.dll`, `sklearn\tree\_splitter…pyd`, `arrow_compute.dll`) aparecen bloqueadas una sola vez y luego cargan.
- **Estado**: a las 20:41, `sqlite3` y el almacén SQLite de MLflow importan sin error. Hay que repetir el comando de la prueba de humo tal cual.

### 6.4 Progreso: `make cv` hecho, fallo al cerrar (11/11)
- **Run**: `20261111-204237_humo-h5_omen-pc` con `status: finished`, 4 pliegues, `conformal.json` y `cv_predictions.csv`.
- **Fallo al cerrar**: Python termina con `0xC0000409` en `ucrtbase.dll` y make devuelve error, pero todo se había escrito antes.
- **Reproducción**: Claude lo intentó con MLflow (SQLite) y un LSTM en CUDA y no falló.
- **Faltaba**: `make train` con `CALIB=20261111-204237_humo-h5_omen-pc`.

### 6.5 Resultado: `make train` hecho, el fallo al cerrar se repite (11/11)
- **Run**: `20261111-204612_humo-h5_omen-pc` completo. Termina con el mismo `0xC0000409`.
- **Informe de Windows**: el proceso tenía cargados dos runtimes OpenMP (`libiomp5md.dll` de torch y `vcomp140.dll` de sklearn).
- **Reproducción**: Claude no lo reproduce sin entrenar. Lo probó con Run + MLflow + CUDA, con matplotlib, joblib y sklearn, y lanzado desde make.
- **Commit**: los dos runs están en `97f36ae`.
- **Abierto entonces**: resolver el fallo al cerrar antes de las baterías de experimentos.

### 6.6 Diagnóstico: cuDNN (11/11)
Entrenamientos de 1 a 5 épocas lanzados por Claude con permiso, salidas en el scratchpad.

- **Cuándo aparece**: siempre que el LSTM se entrena en CUDA con cuDNN. No aparece en CPU ni con `torch.backends.cudnn.enabled = False`.
- **Lo que no influye**: MLflow, las gráficas y OpenMP.
- **Cuándo aborta**: el proceso sigue vivo después de entrenar, y liberar memoria (`gc`, `empty_cache`) no falla. Aborta al descargar las DLL al salir: `os._exit` no lo evita y `TerminateProcess` sí.
- **Coste de desactivar cuDNN**: sin cuDNN, cada época tarda 5,9 s; con cuDNN, entre 0,8 y 1,1 s.
- **Versiones**: torch 2.14.0+cu126, cuDNN 9.10.02, driver 610.91, RTX 3050 Ti Laptop.

### 6.7 Arreglo: `finish_process()` en `run.py` (11/11)
- **Qué hace**: al final de `make cv` y `make train`, si es Windows y se usó CUDA, vacía stdout y stderr, cierra el logging y termina con `TerminateProcess`.
- **Comprobación**: Claude lo comprobó con `cv` y `train` reales (1 época, salidas en el scratchpad): salen con código 0, con el log completo y `status: finished`.

## 7. Windows GPU · 11/11/2026 · ✅: cierre de la fase 2, prueba de humo de RNN, GRU y h=252

Prueba de humo de las celdas que faltan (RNN y GRU, h=5) y del horizonte más largo (LSTM, h=252), a 3 épocas. Solo comprueba que todo funciona y que `make` termina sin error; sus cifras no valen como resultado.

```bash
git pull --rebase
make cv NAME=humo-rnn-h5 ARGS="--set model.cell=rnn --set train.epochs=3 --set train.min_epochs=1"
make cv NAME=humo-gru-h5 ARGS="--set model.cell=gru --set train.epochs=3 --set train.min_epochs=1"
make cv NAME=humo-lstm-h252 ARGS="--set data.horizon=252 --set train.epochs=3 --set train.min_epochs=1"
```

- **Después**: pásale a Claude la salida de los tres comandos. Al subirlos, añade solo esos tres runs: `git add runs/<id> artifacts/<id>` por cada uno.
- **Resultado (11/11)**: los tres runs (`211209_humo-rnn-h5`, `211237_humo-gru-h5`, `211303_humo-lstm-h252`) terminan con `status: finished`, con `conformal.json` y `cv_predictions.csv`.
- **Arreglo de cuDNN**: Windows no registra ningún aborto de python.exe desde las 21:10, así que funciona con `make`.
- **Conclusión**: las tres celdas y h=252 funcionan de principio a fin. Las cifras, a 3 épocas, no valen como resultado.

## 8. Windows GPU · 11/11/2026 · ✅: fase 3, rejilla de la comparativa (432 runs)

- **Qué**: 432 runs de `make cv` (3 celdas × 4 horizontes × 36 configuraciones, 60 épocas con paciencia 10).
- **Duración**: estimación sin medir, 6–8 h de GPU. Mejor de noche, con el portátil enchufado y sin suspensión.
- **Si se corta**: se repite `make sweep` y salta las terminadas.

```powershell
git pull --rebase
make sweep ARGS="--dry-run" | Select-Object -First 3
make sweep
make compare
```

Pásale a Claude la salida de `make compare` (y la lista de fallidas, si `make sweep` la imprime). Para subirlos, solo los runs de la rejilla:

```bash
git add runs/*_g1-* artifacts/*_g1-*
```

- **Resultado (12/11)**: 432/432 runs `finished` (un apagado a mitad y un bloqueo puntual de Smart App Control al reanudar, repetidos con `make sweep`).
- **Carpeta huérfana**: queda una sin terminar (`20261112-001010_g1-lstm-h252-n128-l1-d0-lr0-0001`) que no se sube.
- **Predicción puntual**: ninguna red supera a la persistencia de forma estable en ningún horizonte (`skill_rmse` mediano < 0 en 11 de 12 grupos). El mejor, GRU h=63 con +5,4 %, sale casi todo de un pliegue.
- **Intervalo**: a h=5 los cuantiles de la red mejoran a los históricos en los 4 pliegues (`pinb_skill` +2–3 %).

## 9. Windows GPU · 12/11/2026 · ✅: fase 3, finalistas con 3 semillas (24 runs)

- **Qué**: las 12 configuraciones ganadoras de la rejilla `g1` (mínimo `cv_pinball` por red y horizonte) con las semillas 7 y 123; la 42 ya está en `g1`.
- **Duración**: 24 runs de `make cv`, unos 30 min sin medir.

Primero, el commit de la rejilla (la carpeta a medias del apagado ya está borrada):

```powershell
git add runs/*_g1-* artifacts/*_g1-*
git commit -m "chore(runs): rejilla g1 de la comparativa (432 runs de cv)"
```

Después, los finalistas:

```powershell
$finalistas = @(
  @("gru", 5, 256, 1, 0, 0.001), @("lstm", 5, 256, 2, 0, 0.001), @("rnn", 5, 32, 2, 0, 0.0001),
  @("gru", 21, 128, 2, 0, 0.001), @("lstm", 21, 64, 1, 0, 0.0001), @("rnn", 21, 128, 2, 0.3, 0.0001),
  @("gru", 63, 128, 2, 0.3, 0.0001), @("lstm", 63, 128, 2, 0.3, 0.0001), @("rnn", 63, 256, 1, 0, 0.0001),
  @("gru", 252, 256, 1, 0, 0.001), @("lstm", 252, 64, 2, 0, 0.001), @("rnn", 252, 256, 2, 0.3, 0.0001)
)
foreach ($seed in 7, 123) { foreach ($f in $finalistas) {
  $cell, $h, $n, $l, $d, $lr = $f
  python -m oil_rnn.cv --name "g1s$seed-$cell-h$h-n$n-l$l-d$d-lr$lr" --set seed=$seed --set model.cell=$cell --set data.horizon=$h --set model.hidden_size=$n --set model.num_layers=$l --set model.dropout=$d --set train.learning_rate=$lr
} }
make compare ARGS="--set sweep.prefix=g1s7"
make compare ARGS="--set sweep.prefix=g1s123"
```

- **Comprobación**: cada `make compare` debe listar 12 filas. El aviso «Grupos incompletos: …: 1/36» es esperable (solo hay un run por grupo).
- **Si falta alguna fila** (por ejemplo, por un bloqueo de Smart App Control al importar): pásale a Claude la salida y se repite solo esa.
- **Resultado (12/11)**: 24/24 runs. Con 3 semillas, solo GRU h=63 mejora a la persistencia en las tres (`skill_rmse` +4,8 % ± 0,6 %, 9 de 12 pliegues).
- **Intervalo a h=5**: los de GRU y RNN mejoran a los históricos en las tres semillas (`pinb_skill` +1,3–1,5 %), pero las tres celdas no se distinguen.
- **h=21 y h=252**: ninguna red supera a la persistencia.

## 10. Windows GPU · 12/11/2026 · ✅: fase 4, modelos finales y evaluación única en test

- **Orden**: primero se sube la decisión (`docs/PLAN.md`), para que quede registrada antes de ver test.
- **Cada `make train`**: entrena con train + val la configuración elegida (semilla 42) y aplica la calibración de su run de cv.
- **Cada `make evaluate`**: evalúa en test el run que se acaba de entrenar, solo si el entrenamiento terminó bien.
- **Duración**: unos 5 min en total, sin medir.

```powershell
git add docs/PLAN.md docs/COMANDOS.md
git commit -m "docs(plan): modelo elegido por horizonte para la fase 4"
make train NAME=final-gru-h5 CALIB=20261112-004459_g1-gru-h5-n256-l1-d0-lr0-001_omen-pc ARGS="--set model.cell=gru --set data.horizon=5 --set model.hidden_size=256 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.001"; if ($LASTEXITCODE -eq 0) { make evaluate }
make train NAME=final-lstm-h21 CALIB=20261111-232334_g1-lstm-h21-n64-l1-d0-lr0-0001_omen-pc ARGS="--set model.cell=lstm --set data.horizon=21 --set model.hidden_size=64 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.0001"; if ($LASTEXITCODE -eq 0) { make evaluate }
make train NAME=final-gru-h63 CALIB=20261112-012653_g1-gru-h63-n128-l2-d0-3-lr0-0001_omen-pc ARGS="--set model.cell=gru --set data.horizon=63 --set model.hidden_size=128 --set model.num_layers=2 --set model.dropout=0.3 --set train.learning_rate=0.0001"; if ($LASTEXITCODE -eq 0) { make evaluate }
make train NAME=final-rnn-h252 CALIB=20261111-225050_g1-rnn-h252-n256-l2-d0-3-lr0-0001_omen-pc ARGS="--set model.cell=rnn --set data.horizon=252 --set model.hidden_size=256 --set model.num_layers=2 --set model.dropout=0.3 --set train.learning_rate=0.0001"; if ($LASTEXITCODE -eq 0) { make evaluate }
```

- **Si un `make train` falla** (por ejemplo, por un bloqueo de Smart App Control al importar): su `make evaluate` no se ejecuta; repite solo esa línea. No repitas un `make evaluate` que ya terminó.
- **Al acabar**: avisa a Claude; lee los `eval_test.json` directamente de `runs/`.
- **Resultado (12/11)**: los 4 runs `final-*` terminados y evaluados una vez en test (2023-01-25 a 2026-11-03).
- **Persistencia**: ningún modelo la supera. `skill_rmse` −3,6 % (h=5), −8,1 % (h=21), −61 % (h=63), −45 % (h=252).
- **Cobertura del 80 %**: 78 %, 86 %, 68 % y 92 %.

## 11. Windows GPU · 12/11/2026 · ✅: fase 5, paso 1, instalar Node.js y probar la paridad

- **Hecho por Claude**: `make export-web` (4 ONNX, `manifest.json`, `examples.json`, `market.json`, `quality.json`).
- **Falta**: la prueba de paridad TypeScript ↔ Python, que necesita Node.js, y no está instalado.

Instálalo y **cierra y vuelve a abrir la terminal**:

```powershell
winget install OpenJS.NodeJS.LTS
```

En la terminal nueva:

```powershell
conda activate oil-rnn
node --version
make web-test
make web-dev
```

- **`make web-test`**: debe pasar las 4 pruebas de paridad (una por horizonte).
- **`make web-dev`**: abre la página provisional en http://localhost:5173; debe listar los 4 horizontes. Se para con Ctrl+C.
- **Después**: pásale a Claude la salida de `make web-test` y las cifras de la página.
- **Resultado (12/11)**: Node instalado; `make web-test` pasa 9/9, con las 4 pruebas de paridad. La página provisional da las mismas cifras que Python (h=5: 111,39; h=21: 116,89; h=63: 174,48; h=252: 174,75 $/bbl).

## 12. Windows GPU · 12/11/2026 · ✅: push forzado tras quitar `Co-Authored-By` del historial

- **Qué hizo Claude**: reescribió localmente los 33 commits de `main` para quitar la línea `Co-Authored-By: Claude` (8 commits afectados).
- **Qué cambia**: contenido, autores y fechas no; los hashes sí, así que hay que forzar el push.
- **Copia de seguridad**: rama local `backup/pre-coauthor-rewrite`.

```powershell
git push --force-with-lease origin main
```

En el Mac, antes de seguir trabajando (descarta el `main` local antiguo; si tienes cambios sin commitear, guárdalos antes con `git stash`):

```bash
git fetch origin
git reset --hard origin/main
```

- **Cuando todo esté bien en las dos máquinas**: `git branch -D backup/pre-coauthor-rewrite`.
- **Resultado (12/11)**: push forzado hecho en Windows; ningún commit de `main` lleva ya `Co-Authored-By`. Falta el `reset` en el Mac.
- **Cierre (12/11)**: Mac con `main` al día tras el `reset` y rama `backup/pre-coauthor-rewrite` borrada en Windows (según el usuario).

## 13. Windows GPU · 12/11/2026 · ✅: fase 5, pasos 3–5, revisar la interfaz con Sonda

- **Hecho por Claude**: interfaz con Sonda, texto para el usuario y ciclo económico. Pasó `make test`, `make lint`, las pruebas web (15/15), la compilación y una captura de la página.
- **Qué revisar**: la interfaz en el navegador, con los cuatro horizontes (pestañas o tarjetas).

```powershell
make web-dev
```

- **Uso**: se abre en http://localhost:5173 y se para con Ctrl+C. Pásale a Claude lo que quieras cambiar.
- **Resultado (12/11)**: Release `model-v1` con los 4 modelos; repositorio hecho público y Pages activado por el usuario.
- **Publicación**: la web está en https://alejandrobarreche.github.io/oil-rnn/ (página, manifiesto, datos y modelos responden 200). El rediseño queda para otra sesión.

## 14. Mac · 12/11/2026 · ✅: instalar Streamlit y abrir el explorador

- **Hecho por Claude**: `docs/DECISIONES.md`, `src/oil_rnn/explore.py`, `explore_plots.py`, cuadernos 02–05 y `app/explorador.py`. Pasó `make test` (56) y `make lint`.
- **Sin comprobar**: el explorador no se ha abierto; Streamlit no está instalado en el Mac.
- **`pyproject.toml`**: tiene el grupo `explore` sin commit. `make lock` actualiza `poetry.lock`; después Claude hace commit de los dos. No hagas push antes: la CI fallaría con el lock desfasado.

```bash
make lock
make explore-install
make test
make explore
```

- **`make test`**: ahora ejecuta también `tests/test_explorador.py`, que abre las seis páginas.
- **Qué revisar**: las seis páginas del menú lateral. Pásale a Claude la salida de `make test` y lo que falle o no se entienda.
- **Resultado (12/11)**: lock regenerado (solo añade Streamlit 1.67.0 y 7 dependencias; ninguna versión existente cambia) y `make test` con 62 pasados, incluidas las seis páginas del explorador. Falta tu revisión visual de `make explore`.

## 15. Mac · 12/11/2026 · ✅: ejecutar los cuadernos 02 a 05

- **Dónde**: PyCharm o Jupyter, con el kernel del entorno `oil-rnn`. Orden: 02, 03, 04 y 05.
- **Comprobado por Claude**: el código de las celdas se ejecutó como script sin errores. Los cuadernos están sin salidas.
- **Alternativa por terminal** (deja las salidas guardadas en cada cuaderno):

```bash
python -m jupyter nbconvert --to notebook --execute --inplace notebooks/02_proceso_del_dato.ipynb notebooks/03_validacion.ipynb notebooks/04_modelos.ipynb notebooks/05_resultados.ipynb
```

- **Si `jupyter` no está instalado**: ábrelos desde PyCharm; no hace falta instalar nada.
- **Qué revisar**: que cada figura se entiende con su texto. Pásale a Claude las dudas.
- **Resultado (13/11)**: cuadernos 02–05 ejecutados por el usuario y confirmados en `37d913a`; todas las celdas de código tienen salida.

## 16. Mac · 12/11/2026 · ✅: descargar los modelos ONNX para `make web-dev`

- **Causa comprobada por Claude**: `web/public/model/` tiene `manifest.json` y `examples.json`, pero no `h5.onnx`, `h21.onnx`, `h63.onnx` ni `h252.onnx` (están fuera de git; los crea `make export-web` en Windows). Vite responde a `model/h5.onnx` con `index.html` (200, `text/html`) y ONNX Runtime no puede leerlo, así que la página no carga.
- **Arreglo**: bajar los cuatro modelos de la Release `model-v1`, igual que hace `pages.yml`. `gh` no está instalado en el Mac; se usa `curl`.

```bash
for h in 5 21 63 252; do curl -fL -o web/public/model/h$h.onnx https://github.com/alejandrobarreche/oil-rnn/releases/download/model-v1/h$h.onnx; done
ls -la web/public/model/*.onnx
make web-dev
```

- **Si `curl` da 404**: la Release no existe o el repo es privado. Alternativa: copiar los `web/public/model/*.onnx` de Windows al Mac.
- **Qué pasarle a Claude**: la salida de `ls` y lo que muestre la consola del navegador si sigue fallando.
- **Resultado (13/11)**: los cuatro ONNX están en el Mac y su SHA-256 coincide con `manifest.json`; `make web-test` 25/25, con la paridad con Python en los 4 horizontes.

## 17. Windows GPU · 16/11/2026 · ✅: prueba de red pequeña con tasa de aprendizaje baja (GRU, 5 días)

- **Pregunta**: ¿se alarga la curva de entrenamiento con una red de 16 unidades, tasa de aprendizaje 0,00003 y hasta 150 épocas? En el run final a 5 días (GRU de 256 unidades, 211.203 parámetros, tasa 0,001) la mejor época fue la 3 de 13.
- **Qué hace**: validación walk-forward de 4 pliegues con valores sobrescritos; no cambia código ni `configs/config.yaml`. Es una prueba: sus resultados no son definitivos.
- **Sin comprobar por Claude**: el comando no se ha ejecutado en el Mac.

```powershell
make cv NAME=mini-gru-h5 ARGS="--set data.horizon=5 --set data.window=20 --set model.cell=gru --set model.hidden_size=16 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.00003 --set train.batch_size=128 --set train.epochs=150 --set train.patience=15"
```

- **Resultado (16/11)**: run `20261116-222735_mini-gru-h5_omen-pc`, 4 pliegues. `cv_skill_vs_baseline` −0,7 % y `cv_pinball_skill` −0,6 %; cobertura 70 % (86 % con la corrección conformal). La GRU de 256 unidades de la rejilla tenía −0,1 %, +2,6 % y 78 %.
- **Curva**: en los 4 pliegues la mejor época es la 150 de 150 y la pérdida de parada baja sin oscilar (entre 0 y 12 subidas en 150 épocas). El entrenamiento se cortó por el tope, no por early stopping: la red seguía mejorando.
- **Conclusión**: la curva se alarga y se suaviza, pero con tasa 0,00003 no converge en 150 épocas; sus métricas no son comparables con las de la red grande. Sigue en la entrada 18.
- **Subida (16/11)**: run en `bcbe70c`, con este bloque:

```powershell
git add runs/20261116-222735_mini-gru-h5_omen-pc artifacts/20261116-222735_mini-gru-h5_omen-pc
git commit -m "chore(runs): prueba mini-gru-h5 con red pequeña y tasa de aprendizaje baja"
git pull --rebase
git push
```

## 18. Windows GPU · 16/11/2026 · ✅: la red pequeña hasta converger (GRU, 5 días)

- **Pregunta**: entrenada hasta que pare el early stopping, ¿iguala la red de 16 unidades a la GRU de 256 de la rejilla (`cv_skill_vs_baseline` −0,1 %, `cv_pinball_skill` +2,6 %)?
- **Qué cambia frente a la entrada 17**: tasa de aprendizaje 0,0001 y 0,0003 (antes 0,00003), tope de 400 épocas y paciencia 20. No cambia código ni `configs/config.yaml`.
- **Duración estimada**: hasta 5 min por run (la entrada 17 tardó 20–27 s por pliegue con 150 épocas).
- **Sin comprobar por Claude**: los comandos no se han ejecutado en el Mac.

```powershell
make cv NAME=mini-gru-h5-lr1e4 ARGS="--set data.horizon=5 --set data.window=20 --set model.cell=gru --set model.hidden_size=16 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.0001 --set train.batch_size=128 --set train.epochs=400 --set train.patience=20"
make cv NAME=mini-gru-h5-lr3e4 ARGS="--set data.horizon=5 --set data.window=20 --set model.cell=gru --set model.hidden_size=16 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.0003 --set train.batch_size=128 --set train.epochs=400 --set train.patience=20"
```

- **Para subirlos**: solo estos dos runs.

```powershell
git add runs/*_mini-gru-h5-lr* artifacts/*_mini-gru-h5-lr*
git commit -m "chore(runs): red pequeña a 5 días hasta converger, tasas 0,0001 y 0,0003"
git pull --rebase
git push
```

- **Resultado (16/11)**: runs `20261116-224931_mini-gru-h5-lr1e4_omen-pc` y `20261116-225152_mini-gru-h5-lr3e4_omen-pc`, subidos en `ccd3776`.
- **Curva**: con tasa 0,0001 para el early stopping en los 4 pliegues (mejor época 132, 130, 62 y 116) y la pérdida de ajuste queda junto a la de parada (0,226 / 0,191 en el pliegue 1). La GRU de 256 acababa con 0,128 / 0,272: memorizaba.
- **Métricas de validación (una semilla)**: tasa 0,0001: `cv_skill_vs_baseline` −0,3 %, `cv_pinball_skill` +1,5 %, cobertura 77 %. GRU de 256 de la rejilla: −0,1 %, +2,6 %, 78 %. Tasa 0,0003: −2,7 % y −0,4 %, con un pliegue en −7,3 %; se descarta.
- **Conclusión**: la red pequeña arregla la curva y deja de memorizar, pero a 5 días no mejora las métricas. La diferencia con la grande (1,1 puntos de `pinball_skill`) es menor que la variación entre pliegues y hay una sola semilla: no se puede decir cuál es mejor.

## 19. Windows GPU · 16/11/2026 · ✅: rejilla m1, redes pequeñas en los cuatro horizontes

- **Pregunta**: con 16 o 32 unidades, ventana de 20 días y tasa 0,0001, ¿iguala cada red (RNN, LSTM, GRU) a su mejor configuración de la rejilla `g1` en 5, 21, 63 y 252 días, con curvas que convergen?
- **Qué hace**: 24 runs de `make cv` (3 redes × 4 horizontes × 2 tamaños), sin cambiar código ni `configs/config.yaml`. Es reanudable: si se corta, el mismo comando sigue donde iba.
- **Duración estimada**: unos 45 min (el run de la entrada 18 con tasa 0,0001 tardó 1 min 47 s); más si varios llegan al tope de 400 épocas.
- **Comprobado por Claude**: `--dry-run` en el Mac lista las 24 combinaciones. El entrenamiento no se ha ejecutado.
- **Límite**: cambian a la vez el tamaño y la ventana (60 → 20). Si `m1` queda por debajo de `g1`, hará falta repetirla con ventana 60 para separar las dos causas.

```powershell
make sweep ARGS="--set sweep.prefix=m1 --set sweep.hidden_size=[16,32] --set sweep.depth=[[1,0.0]] --set sweep.learning_rate=[0.0001] --set data.window=20 --set train.batch_size=128 --set train.epochs=400 --set train.patience=20"
make compare ARGS="--set sweep.prefix=m1 --set sweep.hidden_size=[16,32] --set sweep.depth=[[1,0.0]] --set sweep.learning_rate=[0.0001]"
```

- **Para subirlos**: solo los runs de esta rejilla.

```powershell
git add runs/*_m1-* artifacts/*_m1-*
git commit -m "chore(runs): rejilla m1 de redes pequeñas (24 runs de cv)"
git pull --rebase
git push
```

- **Qué pasarle a Claude**: la salida de `make compare` y un aviso cuando estén subidos.

- **Resultado (16/11)**: 24 runs `*_m1-*`, subidos en `10e4129`. Todo es validación (4 pliegues); `m1` tiene una semilla y los ganadores de `g1` tres (42, 7 y 123).
- **`cv_pinball_skill`, mejor red pequeña frente al modelo publicado en la web (elegido en `g1`, media de 3 semillas)**:

| Horizonte | Mejor `m1` (1 semilla) | Modelo publicado (media de 3 semillas) | Mediana de las 108 de `g1` |
|---|---|---|---|
| 5 | GRU-16: +1,5 % | GRU-256: +1,5 % | +1,1 % |
| 21 | RNN-16: −1,4 % | LSTM-64: +0,4 % | −1,3 % |
| 63 | LSTM-16: −3,8 % | GRU-128: +2,6 % | −2,3 % |
| 252 | RNN-32: −11,0 % | RNN-256: −2,3 % | −10,5 % |

- **Curvas**: a 5 días las pequeñas paran entre las épocas 29 y 340. A 63 y 252 días también memorizan pronto en el pliegue 3 (mejor época 3 a 26).
- **Semillas de `g1`**: el `pinball_skill` del mismo modelo cambia hasta 12 puntos entre semillas a 252 días (GRU-256: +4,3 %, −4,2 %, −8,3 %) y entre 1 y 4 a 5 días. El único resultado estable es la GRU-128 a 63 días: `skill_vs_baseline` +5,4 %, +4,5 % y +4,4 %.
- **Conclusión**: a 5 días la red pequeña iguala a la grande con 125 veces menos parámetros y una curva que converge. A 21, 63 y 252 días queda por debajo, pero `m1` cambió a la vez tamaño y ventana (20 en vez de 60), así que no se sabe cuál de las dos lo causa. A 252 días ninguna red supera a la persistencia de forma estable.

## 20. Windows GPU · 16/11/2026 · ✅: rejilla m2 (redes pequeñas con ventana 60) y semillas de la GRU-16 a 5 días

- **Pregunta**: (a) a 21, 63 y 252 días, ¿la red pequeña falla por su tamaño o por ver solo 20 días? (b) a 5 días, ¿la GRU-16 mantiene su resultado con otras dos semillas, como la GRU-256?
- **Qué hace**: (a) 18 runs de `make cv` como los de `m1`, con la ventana de 60 de la config; (b) 2 runs de `make cv` de la GRU-16 a 5 días con semillas 7 y 123. Sin cambiar código ni `configs/config.yaml`.
- **Duración estimada**: unos 35 min.
- **Comprobado por Claude**: `--dry-run` en el Mac lista las 18 combinaciones de `m2`. El entrenamiento no se ha ejecutado.
- **Cómo se decide**: si `m2` iguala la media de 3 semillas del modelo publicado en un horizonte, ese horizonte pasa a red pequeña; si no, se queda el modelo actual.

```powershell
make sweep ARGS="--set sweep.prefix=m2 --set sweep.horizons=[21,63,252] --set sweep.hidden_size=[16,32] --set sweep.depth=[[1,0.0]] --set sweep.learning_rate=[0.0001] --set train.batch_size=128 --set train.epochs=400 --set train.patience=20"
foreach ($seed in 7, 123) {
  python -m oil_rnn.cv --name "m1s$seed-gru-h5-n16-l1-d0-lr0.0001" --set seed=$seed --set model.cell=gru --set data.horizon=5 --set model.hidden_size=16 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.0001 --set data.window=20 --set train.batch_size=128 --set train.epochs=400 --set train.patience=20
}
```

- **Para subirlos**: solo estos runs.

```powershell
git add runs/*_m2-* artifacts/*_m2-* runs/*_m1s* artifacts/*_m1s*
git commit -m "chore(runs): rejilla m2 con ventana 60 y semillas de la GRU-16 a 5 días (20 runs de cv)"
git pull --rebase
git push
```

- **Qué pasarle a Claude**: un aviso cuando estén subidos.

- **Resultado (17/11)**: 20 runs (`*_m2-*`, `*_m1s7-*`, `*_m1s123-*`), subidos en `93ce204`. Todo es validación (4 pliegues).
- **(a) Ventana**: con 60 días las redes pequeñas quedan igual que con 20 (mejor `cv_pinball_skill`: 21 días −1,5 %, 63 días −3,1 %, 252 días −11,4 %). La ventana no es la causa; a 21, 63 y 252 días la red pequeña no iguala al modelo publicado (+0,5 %, +2,6 % y −2,3 % de media en 3 semillas). Se quedan los modelos publicados.
- **(b) GRU-16 a 5 días, 3 semillas**: `cv_pinball_skill` +1,5 %, −0,7 % y +1,2 % (media +0,7 %); `cv_skill_vs_baseline` −0,3 %, −0,2 % y −0,7 % (media −0,4 %). GRU-256 publicada: +1,5 % y −1,1 % de media. La diferencia (0,8 puntos de `pinball_skill` a favor de la grande, 0,7 de error a favor de la pequeña) es menor que la variación entre semillas (desviación ≈ 1,1 puntos en las dos).
- **Conclusión**: a 5 días las dos empatan dentro del ruido. Se elige la GRU-16 por el criterio de coste del enunciado: 1.683 parámetros frente a 211.203 y curvas que paran por *early stopping* (mejor época 34–163) en vez de memorizar en la época 1–2. Ninguna de las dos mejora a la persistencia en error medio.

## 21. Mac · 17/11/2026 · ✅: modelo final GRU-16 a 5 días y su evaluación en test

- **Pregunta**: ¿qué error tiene en test (2023–2026) la GRU-16 elegida en la entrada 20, frente a la persistencia y frente a la GRU-256 publicada (−3,6 % en `skill_vs_baseline`)?
- **Qué hace**: `make train` con train+val y la misma configuración que la rejilla `m1`, calibrando el intervalo con su run de cv; después `make evaluate` en test una sola vez. Sin cambiar código ni `configs/config.yaml`.
- **Duración estimada**: 1–2 min.
- **Comprobado por Claude**: el run de calibración existe (`20261116-231322_m1-gru-h5-n16-l1-d0-lr0-0001_omen-pc`) y `make export-web` admite modelos con ventanas distintas. El entrenamiento no se ha ejecutado.

```powershell
make train NAME=final-gru16-h5 CALIB=20261116-231322_m1-gru-h5-n16-l1-d0-lr0-0001_omen-pc ARGS="--set model.cell=gru --set data.horizon=5 --set model.hidden_size=16 --set model.num_layers=1 --set model.dropout=0.0 --set train.learning_rate=0.0001 --set data.window=20 --set train.batch_size=128 --set train.epochs=400 --set train.patience=20"; if ($LASTEXITCODE -eq 0) { make evaluate }
```

- **Para subirlo**: solo este run.

```powershell
git add runs/*_final-gru16-h5_* artifacts/*_final-gru16-h5_*
git commit -m "chore(runs): modelo final GRU-16 a 5 días evaluado en test"
git pull --rebase
git push
```

- **Qué pasarle a Claude**: un aviso cuando esté subido. Después Claude cambia `web.models` en `configs/config.yaml` y `docs/DECISIONES.md`, y te da `make export-web` y `make web-release`.

- **Resultado (17/11)**: ejecutado en el Mac (sin el Windows disponible), con los mismos comandos en zsh. Run `20261117-094043_final-gru16-h5_mac`, subido en `047fe16`. Test (955 pronósticos, 2023–2026): `skill_vs_baseline` −1,8 % (GRU-256 publicada: −3,6 %), `pinball_skill` +0,0 % (GRU-256: −1,4 %), cobertura 78 % frente a 79 % de la persistencia, acierto de dirección 48,6 % frente a 50,2 %. Diebold-Mariano con error cuadrático: p = 0,32, no significativo. No mejora a la persistencia; la elección se hizo en validación y no se revisa por esta cifra.

## 22. Mac · 17/11/2026 · ⏳: publicar la GRU-16 a 5 días en la web (Release `model-v2`)

- **Pregunta**: ninguna; publica el cambio de modelo decidido en la entrada 20 y evaluado en la 21.
- **Qué hace**: exporta a ONNX solo el modelo de 5 días (en el Mac solo están sus pesos) y reutiliza los ONNX de 21, 63 y 252 días que ya tienes de `model-v1`; regenera los datos de la web y de la página explicativa, comprueba la paridad Python ↔ TypeScript y publica los cuatro ONNX como Release `model-v2`.
- **Duración estimada**: 1–2 min, más la subida de la Release.
- **Comprobado por Claude**: `make test` y `make lint` pasan; los tres ONNX reutilizados coinciden en run y hash con `manifest.json`; los modelos finales que leen el explorador, los cuadernos y la página explicativa son los de `web.models`. La exportación no se ha ejecutado.

```bash
conda activate oil-rnn
make export-web RELEASE=model-v2 HORIZONS=5
make export-explain
make web-test
gh auth status || gh auth login
make web-release RELEASE=model-v2
```

- **Para subirlo**:

```bash
git add web/public/model/manifest.json web/public/model/examples.json web/public/data
git commit -m "feat(web): GRU-16 como modelo a 5 días (Release model-v2)"
git pull --rebase
git push
```

- **Qué pasarle a Claude**: la salida de `make export-web` y `make web-test`, y un aviso cuando esté subido.
