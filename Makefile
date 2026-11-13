# oil-rnn — comandos del proyecto. Lista completa: make help
#
# Instalación en un ordenador nuevo:
#   git clone <repo> && cd oil-rnn
#   make setup                 crea el entorno conda e instala todo (detecta Mac / NVIDIA / CPU)
#   conda activate oil-rnn

POETRY ?= poetry
PYTHON ?= python
CONDA_ENV := oil-rnn
PKG := oil_rnn
POETRY_GROUPS := dev,web

# Hardware detectado: mac | cuda | cpu. Se puede forzar: make install BACKEND=rocm
BACKEND ?= $(shell $(PYTHON) -c "import platform, shutil; print('mac' if platform.system() == 'Darwin' else 'cuda' if shutil.which('nvidia-smi') else 'cpu')")

# PyTorch depende del hardware, así que no está en poetry.lock: se fija aquí y lo instala pip.
# Si añades torchvision/torchaudio, ponlos junto a torch con su versión compatible.
TORCH_VERSION := 2.14.0
TORCH_INDEX_cpu := https://download.pytorch.org/whl/cpu
TORCH_INDEX_cuda := https://download.pytorch.org/whl/cu126
TORCH_INDEX_rocm := https://download.pytorch.org/whl/rocm7.2

NAME ?= run
ARGS ?=
RUN ?=
SPLIT ?= test
ZIP ?=
RELEASE ?= model-v1
# Repositorio explícito: el remoto SSH usa un alias de host que gh no reconoce.
GH_REPO ?= alejandrobarreche/oil-rnn
CALIB ?=

.PHONY: help setup pending check-env install install-mac install-cpu install-cuda install-rocm \
        backend-mac backend-cpu backend-cuda backend-rocm lock test lint format device \
        data prepare cv sweep compare dm naive-futures train evaluate runs pack unpack mlflow-ui explore-install explore export-web export-explain web-install web-dev web-test web-build web-release


help:
	@echo "oil-rnn"
	@echo "== Entorno =="
	@echo "  make setup            crea el entorno conda $(CONDA_ENV) e instala todo"
	@echo "  conda activate $(CONDA_ENV)"
	@echo "  make install          reinstala en el entorno activo, hardware: $(BACKEND)"
	@echo "  make install-mac / install-cpu / install-cuda / install-rocm"
	@echo "  make device           comprueba que hardware ve el framework"
	@echo "  make pending          valores PENDIENTE y PROVISIONAL de configs/config.yaml"
	@echo "== Datos y experimentos =="
	@echo "  make data             descarga los datos en data/raw/"
	@echo "  make prepare          crea data/train, data/val y data/test"
	@echo "  make cv NAME=lstm-h5   validacion walk-forward (4 pliegues sobre train+val)"
	@echo "  make sweep            rejilla de la comparativa (configs: sweep), reanudable"
	@echo "  make compare          mejor configuracion por red y horizonte, ARGS=--all para todas"
	@echo "  make dm               Diebold-Mariano de los modelos finales frente a la persistencia (test)"
	@echo "  make naive-futures    persistencia actualizada con el futuro del Brent, en los bloques de cv"
	@echo "  make train NAME=baseline ARGS='--set train.epochs=50'  modelo final (train+val), CALIB=<run de cv> calibra el intervalo"
	@echo "  make evaluate         evalua el ultimo run sobre test, opcion RUN=id"
	@echo "  make runs             tabla de runs"
	@echo "  make pack RUN=id      empaqueta un run con sus pesos, y make unpack ZIP=archivo lo restaura"
	@echo "  make mlflow-ui        interfaz de MLflow"
	@echo "== Web =="
	@echo "  make export-web       exporta los modelos de web.models (configs) a ONNX para web/"
	@echo "  make export-explain   datos de la pagina explicativa (web/public/data/explain.json)"
	@echo "  make web-dev          servidor de desarrollo en http://localhost:5173"
	@echo "  make web-test         paridad TypeScript frente a Python"
	@echo "  make web-build        compila web/dist"
	@echo "  make web-release      sube los h<h>.onnx a la Release RELEASE=model-v1 para GitHub Pages"
	@echo "== Explorador =="
	@echo "  make explore-install  instala Streamlit (grupo opcional explore)"
	@echo "  make explore          abre el explorador del proceso en http://localhost:8501"
	@echo "== Calidad =="
	@echo "  make test / lint / format / lock"


# ── Entorno ────────────────────────────────────────────────
setup:
	$(PYTHON) scripts/setup_env.py

pending:
	$(PYTHON) scripts/setup_env.py --pending

check-env:
	@$(PYTHON) -c "import pathlib, sys; sys.exit(0 if pathlib.Path(sys.prefix).name == '$(CONDA_ENV)' else 'ERROR: activa el entorno: conda activate $(CONDA_ENV)  (python actual: ' + sys.prefix + ')')"

install: check-env
	$(POETRY) install --with $(POETRY_GROUPS)
	$(MAKE) backend-$(BACKEND)
	-$(PYTHON) -m pip check
	@echo Instalado para: $(BACKEND). Comprueba el hardware con: make device

install-mac:
	$(MAKE) install BACKEND=mac
install-cpu:
	$(MAKE) install BACKEND=cpu
install-cuda:
	$(MAKE) install BACKEND=cuda
install-rocm:
	$(MAKE) install BACKEND=rocm

backend-mac:
	$(PYTHON) -m pip install "torch==$(TORCH_VERSION)"
backend-cpu:
	$(PYTHON) -m pip install "torch==$(TORCH_VERSION)+cpu" --index-url $(TORCH_INDEX_cpu)
backend-cuda:
	$(PYTHON) -m pip install "torch==$(TORCH_VERSION)+cu126" --index-url $(TORCH_INDEX_cuda)
backend-rocm:
	$(PYTHON) -m pip install "torch==$(TORCH_VERSION)+rocm7.2" --index-url $(TORCH_INDEX_rocm)

device: check-env
	$(PYTHON) -c "import platform, torch; print('Sistema:', platform.platform()); print('PyTorch:', torch.__version__); print('CUDA:', torch.cuda.is_available(), torch.version.cuda); print('ROCm:', torch.version.hip); print('MPS:', torch.backends.mps.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else '-')"

lock: check-env
	$(POETRY) lock


# ── Datos y experimentos ───────────────────────────────────
data: check-env
	$(PYTHON) -m $(PKG).download

prepare: check-env
	$(PYTHON) -m $(PKG).data $(ARGS)

cv: check-env
	$(PYTHON) -m $(PKG).cv --name $(NAME) $(ARGS)

sweep: check-env
	$(PYTHON) -m $(PKG).sweep $(ARGS)

compare: check-env
	$(PYTHON) -m $(PKG).sweep --compare $(ARGS)

dm: check-env
	$(PYTHON) -m $(PKG).explore dm

naive-futures: check-env
	$(PYTHON) -m $(PKG).explore naive-futures

train: check-env
	$(PYTHON) -m $(PKG).train --name $(NAME) $(if $(CALIB),--calibration $(CALIB),) $(ARGS)

evaluate: check-env
	$(PYTHON) -m $(PKG).evaluate --split $(SPLIT) $(if $(RUN),--run $(RUN),)

runs: check-env
	$(PYTHON) -m $(PKG).runs_cli

pack: check-env
	$(PYTHON) -m $(PKG).runs_cli --pack $(RUN)

unpack: check-env
	$(PYTHON) -m $(PKG).runs_cli --unpack $(ZIP)

mlflow-ui: check-env
	$(PYTHON) -m $(PKG).runs_cli --mlflow-ui


# ── Explorador (Streamlit, local) ──────────────────────────
explore-install: check-env
	$(POETRY) install --with $(POETRY_GROUPS),explore

explore: check-env
	$(PYTHON) -m streamlit run app/explorador.py


# ── Web ────────────────────────────────────────────────────
export-web: check-env
	$(PYTHON) -m $(PKG).export_web --release $(RELEASE)

export-explain: check-env
	$(PYTHON) -m $(PKG).export_web --explain

web-install:
	cd web && npm install

web-dev: web-install
	cd web && npm run dev

web-test: web-install
	cd web && npm test

web-build: web-install
	cd web && npm run build

web-release:
	gh release create $(RELEASE) web/public/model/*.onnx --repo $(GH_REPO) --title $(RELEASE) --notes "Modelos para la web"


# ── Calidad ────────────────────────────────────────────────
test: check-env
	$(PYTHON) -m pytest

lint: check-env
	$(PYTHON) -m ruff check .
	$(PYTHON) -m ruff format --check .

format: check-env
	$(PYTHON) -m ruff format .
	$(PYTHON) -m ruff check --fix .
