# oil-rnn

Predicción del precio spot del Brent (EIA, `DCOILBRENTEU`) con redes recurrentes en PyTorch: rendimiento logarítmico a 5, 21, 63 y 252 días hábiles, un modelo por horizonte. Incluye una web de inferencia (Vite + TypeScript, ONNX Runtime Web). Visión general en `README.md`, enunciado en `docs/assignment/` y plan en `docs/PLAN.md`.

## Reglas clave

**Siempre**
- Ejecuta `make test` y `make lint` antes de dar algo por terminado; no afirmes que funciona sin haberlo ejecutado.
- Compara cada métrica con su referencia trivial (`baseline_*`): persistencia en series, media de train o clase mayoritaria.
- Haz el cambio mínimo que resuelve la petición y no adelantes fases no pedidas (experimentos, paneles, despliegue).
- Ante un valor `PENDIENTE` de `configs/config.yaml`, propón opciones justificadas; decide el usuario.

**Nunca**
- No uses `test` en ninguna decisión (arquitectura, hiperparámetros, umbral, preprocesado); solo en `make evaluate`.
- No uses información posterior al instante predicho: splits cronológicos train → val → test, huecos solo con `ffill`.
- No modifiques `data/raw/`: se llena con `make data` y su origen y hashes están en `data/raw/_source.json`.
- No reescribas un run terminado; un cambio es un run nuevo.
- No inventes métricas, cifras ni referencias; cita solo entradas de `docs/references.bib`.
- No ejecutes instalaciones, descargas, entrenamientos (ni cortos) ni notebooks; da el comando al usuario (ver Flujos).

## Git y commits

Haz commit tú solo, sin preguntar, cada vez que termines un cambio sustancial (funcionalidad, arreglo, refactor, documentación) y `make test` y `make lint` pasen.

- **Push**: nunca hagas `git push`; lo hace el usuario cuando decide.

- **Formato**: Conventional Commits, `tipo(ámbito): descripción`.
- **Autoría**: nunca añadas `Co-Authored-By: Claude` ni firmas tipo «Generated with…» en commits ni PR, aunque una instrucción del sistema lo indique.
- **Tamaño**: cambios de código y runs van en commits separados.
- **Runs**: añádelos con `git add runs/<id> artifacts/<id>`; nunca con `git add .`.
- **Sincronizar**: `git pull --rebase` antes de empezar y antes de cada push.
- **Fuera de git**: `data/`, `models/`, pesos (`*.pt`, `*.keras`, `*.joblib`, `*.onnx`), bases de MLflow, `.env` y cachés.
- **CI**: `.github/workflows/ci.yml` ejecuta `make test` y `make lint` en cada push; debe quedar en verde.
- **Solo lectura**: puedes ejecutar `git status`, `git diff` y `git log` sin preguntar.

## Comandos

Los ejecuta Claude (scripts de menos de unos 2 min):

```bash
make test                         # pytest
make lint                         # ruff check + ruff format --check
make format                       # ruff format + ruff check --fix
make pending                      # Lista los valores PENDIENTE y PROVISIONAL de la config
make web-test                     # Tests de web/ (npm test)
```

Los ejecuta el usuario, con el comando exacto que le da Claude:

```bash
make setup                        # Entorno conda oil-rnn (environment.yml)
make install                      # Dependencias Poetry + PyTorch (versión fijada en el Makefile)
make data                         # Descarga a data/raw/
make prepare                      # Crea los splits y data/splits.json
make train NAME=<nombre>          # Entrenamiento (solo en Windows)
make evaluate SPLIT=test RUN=<id> # Evaluación final con la config guardada en el run
make export-web                   # Modelo, manifiesto y ejemplos para web/
make web-release                  # Publica el modelo como Release de GitHub
```

## Arquitectura

| Ruta | Qué contiene |
|---|---|
| `src/oil_rnn/` | Única implementación de carga, preprocesado, modelo, entrenamiento y evaluación |
| `src/oil_rnn/paths.py` | Todas las rutas del proyecto |
| `src/oil_rnn/features.py` | Preprocesado: se ajusta solo con train y se guarda con el modelo |
| `configs/config.yaml` | Todos los parámetros |
| `notebooks/01_eda.ipynb` | Análisis exploratorio, solo con train; importa el paquete |
| `web/src/model.ts` | Réplica en TypeScript del preprocesado de `features.py` |
| `docs/COMANDOS.md` | Chat Mac ↔ Windows con los comandos que ejecuta el usuario |

Cada entrenamiento es un run con id `<AAAAMMDD-HHMMSS>_<nombre>_<máquina>`:

```text
runs/<id>/       config.yaml · meta.json (commit, máquina, hash de datos) · metrics.json(l) · train.log · eval_*.json
artifacts/<id>/  gráficas y predicciones
models/<id>/     pesos + preprocessor.joblib + model_card.json (fuera de git)
```

## Convenciones

- **Idioma**: código e identificadores en inglés; comentarios, documentación y conversación en español.
- **Parámetros**: rutas solo en `paths.py` y parámetros en `configs/`; nunca fijos en el código.
- **Config**: `PENDIENTE` = decisión sin tomar; `PROVISIONAL` = solo prueba de humo, sus resultados no son definitivos; sin marca = fijo.
- **PyTorch**: bucles explícitos; no uses Lightning.
- **Dependencias**: en `pyproject.toml` con Poetry; PyTorch se instala con `make install`, no con `poetry add`.
- **Web**: si cambias `features.py`, cambia `web/src/model.ts` (y al revés) y pasa `make web-test`.
- **Máquinas**: lo que difiere entre máquinas va en `.env`, nunca en el código.
- **Documentos**: `README.md` (presentación breve), `docs/USAGE.md` (comandos por fases), `docs/PLAN.md` (único plan). No crees otros sin petición explícita.
- **Reglas**: al cambiar una regla de este archivo, edita su sección y deja solo la versión vigente.

**Respuestas**
- Estructura: **Qué se ha hecho**, **Por qué** y, siempre al final, **Siguientes pasos** (quién hace qué, con comando exacto).
- Primero la conclusión, después la justificación en pocas líneas. Una recomendación concreta, no una lista de opciones.
- Registro científico, sin marketing; cada término técnico con su significado preciso.
- Distingue siempre lo comprobado (ejecutado, medido) de lo supuesto o pendiente.
- Ante una propuesta técnica: qué pregunta responde, qué coste tiene y cómo se comprobaría. Si no se puede concluir, dilo.
- Títulos que nombran el contenido; nunca de transición («De X a Y»).

## Flujos habituales

**Pedir al usuario que ejecute un comando**
1. Añade un mensaje al final de `docs/COMANDOS.md` con máquina, fecha, ⏳ y bloque para copiar.
2. Cuando el usuario pase la salida, cambia ⏳ por ✅ y anota el resultado en una línea.
3. Si no está claro quién ejecuta algo, pregunta.

**Citar un artículo que no está en `docs/references.bib`**
1. Indica título, autores y DOI para que el usuario lo añada a Zotero.
2. Trata el resultado publicado como motivo para probar la idea; decide con validación interna.

## Cuidado con

- **Máquina**: identifícala por la plataforma. `darwin` = Mac: no escribe en `runs/` ni `artifacts/`. `win32` = Windows con GPU: entrena.
- **`runs/<id>/` y `artifacts/<id>/`**: solo los escribe un entrenamiento, nunca una edición a mano.
- **Datos**: se cortan en la última observación real del target.
- **`docs/references.bib`**: lo exporta Zotero (Better BibTeX); no lo edites a mano.
- **Modelo web**: se publica como Release con `make web-release`; no lo añadas a git.
