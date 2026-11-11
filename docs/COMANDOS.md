# Chat Mac ↔ Windows

Registro de los comandos que se ejecutan en cada máquina, en orden: el mensaje más reciente va al final. Cada mensaje dice quién lo ejecuta y si está hecho. Los bloques se copian tal cual en la terminal de esa máquina.

- 💻 **Mac**: desarrollo (código, tests, commits de código).
- 🖥️ **Windows GPU**: entrenamientos; solo sube sus `runs/<id>` y `artifacts/<id>`.
- ✅ hecho · ⏳ pendiente. Cuando ejecutes un mensaje ⏳, pásale la salida a Claude y él lo marca como ✅.

---

**💻 Mac · 11/11/2026 · ✅**
Datos descargados y splits creados.

```bash
make data
make prepare
```

Resultado: `data/raw/dataset.csv` con sha256 `fa54aa0a5eaa494c52d4ca2764c7b46961391cdf7e9c0e6e826ace7eb72cf377`; train 4.454 filas (2000-08-30 → 2019-04-22), val 955 (→ 2023-01-24), test 955 (→ 2026-11-03).

---

**💻 Mac · 11/11/2026 · ✅**
Subir los commits de la fase 2 (código de los pasos 1–5 y este chat).

```bash
git pull --rebase
git push
```

---

**🖥️ Windows GPU · ✅**
Preparar la máquina con el código y los mismos datos que el Mac.

1. Código y entorno. Requisitos: Miniconda o Miniforge, Git y el driver de NVIDIA al día (`nvidia-smi` debe indicar «CUDA Version» ≥ 12.6). Todo en «Anaconda Prompt».

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

`make device` debe mostrar `CUDA: True` y el nombre de la GPU. Si dice `False`, no sigas.

2. Copiar del Mac a Windows, a mano (USB, nube…), estos dos archivos a la misma ruta: `data/raw/dataset.csv` y `data/raw/_source.json`. `data/` no va a git, y volver a descargar podría dar datos ligeramente distintos.

3. Crear los splits y comprobar que los datos son los mismos que en el Mac:

```bash
make prepare
python -c "import json; print(json.load(open('data/splits.json'))['source']['sha256'])"
```

El hash debe ser `fa54aa0a5eaa494c52d4ca2764c7b46961391cdf7e9c0e6e826ace7eb72cf377`. Si no coincide, no sigas.

4. Opcional: en `.env` (copia de `.env.example`), `MACHINE_NAME=win-gpu`, para que los runs se llamen `<fecha>_<nombre>_win-gpu`.

---

**🖥️ Windows GPU · ✅**
Prueba de humo de la fase 2: validación walk-forward y modelo final, a 3 épocas. Solo comprueba que todo funciona; sus cifras no valen como resultado.

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

---

**🖥️ Windows GPU · 11/11/2026 · ✅**
`make prepare` falla: Windows (Control de aplicaciones / Smart App Control) bloquea la DLL `_parquet` de `pyarrow` instalada por pip. Se sustituye por la compilación de conda-forge, que es otro binario. En «Anaconda Prompt»:

```bash
conda activate oil-rnn
pip uninstall -y pyarrow
conda install -y -c conda-forge "pyarrow>=17"
python -c "import pyarrow.parquet; print('parquet OK')"
make prepare
python -c "import json; print(json.load(open('data/splits.json'))['source']['sha256'])"
```

Si `import pyarrow.parquet` vuelve a dar «Una directiva de Control de aplicaciones bloqueó este archivo», no desactives Smart App Control (en Windows 11 no se puede volver a activar sin reinstalar): pásale a Claude la salida de este comando de PowerShell y se cambia el formato de los splits en el código.

```powershell
Get-MpComputerStatus | Select-Object SmartAppControlState
```

Progreso (11/11): `pip uninstall` y `conda install` hechos (pyarrow 26.0.1 de conda-forge). Falta desde `import pyarrow.parquet`.

Resultado (11/11): `import pyarrow` da `ModuleNotFoundError`. En conda-forge, `pyarrow` es un metapaquete sin archivos (0 en `conda-meta`); el código Python está en `pyarrow-core`, que no quedó instalado, y conda dice «already installed». Las DLL `libarrow*` sí están.

---

**🖥️ Windows GPU · 11/11/2026 · ✅**
Instalar `pyarrow-core`, la parte de `pyarrow` que contiene el código Python, y repetir la comprobación:

```bash
conda install -y -c conda-forge "pyarrow-core=26.0.1"
python -c "import pyarrow.parquet; print('parquet OK')"
make prepare
python -c "import json; print(json.load(open('data/splits.json'))['source']['sha256'])"
```

El hash debe ser `fa54aa0a5eaa494c52d4ca2764c7b46961391cdf7e9c0e6e826ace7eb72cf377`. Si `import pyarrow.parquet` da «Una directiva de Control de aplicaciones bloqueó este archivo», pasa la salida de `Get-MpComputerStatus | Select-Object SmartAppControlState`.

Resultado (11/11): `pyarrow-core` se instala, pero Smart App Control bloquea también su DLL (`pyarrow.lib`). Los splits pasan a guardarse como pickle de pandas (`data/<split>/<split>.pkl`), así que ya no hace falta pyarrow. Claude ejecutó `make prepare` en Windows: el hash coincide (`fa54aa0a…cf377`) y 4454/955/955 filas.

Nota (11/11), prueba de humo de la fase 2: el primer `make cv` falló porque Smart App Control bloqueó `sqlite3.dll`, que usa MLflow. Según el registro Code Integrity, casi todas las DLL bloqueadas (`_sqlite3.pyd`, `sqlite3.dll`, `sklearn\tree\_splitter…pyd`, `arrow_compute.dll`) aparecen bloqueadas una sola vez y luego cargan. A las 20:41 `sqlite3` y el almacén SQLite de MLflow importan sin error. Hay que repetir el comando de la prueba de humo tal cual.

Progreso (11/11): `make cv` hecho, run `20261111-204237_humo-h5_omen-pc` con `status: finished`, 4 pliegues, `conformal.json` y `cv_predictions.csv`. Al cerrar, Python termina con `0xC0000409` en `ucrtbase.dll` y make devuelve error, pero todo se había escrito antes. Claude intentó reproducirlo con MLflow (SQLite) y un LSTM en CUDA y no falló. Falta `make train` con `CALIB=20261111-204237_humo-h5_omen-pc`.

Resultado (11/11): `make train` hecho, run `20261111-204612_humo-h5_omen-pc` completo. Termina con el mismo `0xC0000409`, así que el fallo al cerrar se repite. En el informe de Windows, el proceso tenía cargados dos runtimes OpenMP (`libiomp5md.dll` de torch y `vcomp140.dll` de sklearn). Claude no lo reproduce sin entrenar: lo probó con Run + MLflow + CUDA, con matplotlib, joblib y sklearn, y lanzado desde make. Los dos runs están en el commit `97f36ae`. Queda abierto el fallo al cerrar: hay que resolverlo antes de las baterías de experimentos.

Diagnóstico (11/11, entrenamientos de 1 a 5 épocas lanzados por Claude con permiso, salidas en el scratchpad): el fallo aparece siempre que el LSTM se entrena en CUDA con cuDNN. No aparece en CPU ni con `torch.backends.cudnn.enabled = False`. MLflow, las gráficas y OpenMP no influyen. El proceso sigue vivo después de entrenar, y liberar memoria (`gc`, `empty_cache`) no falla. Aborta al descargar las DLL al salir: `os._exit` no lo evita y `TerminateProcess` sí. Sin cuDNN, cada época tarda 5,9 s; con cuDNN, entre 0,8 y 1,1 s. Versiones: torch 2.14.0+cu126, cuDNN 9.10.02, driver 610.91, RTX 3050 Ti Laptop.

Arreglo (11/11): `finish_process()` en `run.py`. Al final de `make cv` y `make train`, si es Windows y se usó CUDA, vacía stdout y stderr, cierra el logging y termina con `TerminateProcess`. Claude lo comprobó con `cv` y `train` reales (1 época, salidas en el scratchpad): salen con código 0, con el log completo y `status: finished`.

---

**🖥️ Windows GPU · 11/11/2026 · ⏳**
Cierre de la fase 2: prueba de humo de las celdas que faltan (RNN y GRU, h=5) y del horizonte más largo (LSTM, h=252), a 3 épocas. Solo comprueba que todo funciona y que `make` termina sin error; sus cifras no valen como resultado.

```bash
git pull --rebase
make cv NAME=humo-rnn-h5 ARGS="--set model.cell=rnn --set train.epochs=3 --set train.min_epochs=1"
make cv NAME=humo-gru-h5 ARGS="--set model.cell=gru --set train.epochs=3 --set train.min_epochs=1"
make cv NAME=humo-lstm-h252 ARGS="--set data.horizon=252 --set train.epochs=3 --set train.min_epochs=1"
```

Pásale a Claude la salida de los tres comandos. Al subirlos, añade solo esos tres runs: `git add runs/<id> artifacts/<id>` por cada uno.
