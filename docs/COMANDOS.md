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

**💻 Mac · 11/11/2026 · ⏳**
Subir los commits de la fase 2 (código de los pasos 1–5 y este chat).

```bash
git pull --rebase
git push
```

---

**🖥️ Windows GPU · ⏳**
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

**🖥️ Windows GPU · ⏳**
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
