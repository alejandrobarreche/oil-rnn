# CLAUDE.md — oil-rnn

Reglas del proyecto y forma de trabajo de Claude.

## 1. Proyecto



- Visión general y uso: `README.md`
- Enunciado o encargo: `docs/assignment/`
- Configuración: `configs/config.yaml`, con tres tipos de valor (`make pending` los lista):
  - `PENDIENTE`: decisión del proyecto aún no tomada. Claude no la rellena por iniciativa propia: propone opciones con su justificación y el usuario decide.
  - `PROVISIONAL`: sirve para una prueba de humo; sus resultados no se presentan como definitivos.
  - Sin marca: fijo.

Principios:

- **Simpleza y organización.** El cambio mínimo que resuelve la petición. Sin abstracciones, scripts ni configuraciones que no se usen ya.
- **Avance paso a paso.** No adelantar fases (baterías de experimentos, paneles, despliegue…) que el usuario no haya pedido.

## 2. Datos

- `data/raw/` es inmutable: se llena con `make data` (o a mano) y `data/raw/_source.json` registra su origen y sus hashes.
- Los splits se crean solo con `make prepare` y quedan descritos en `data/splits.json`.
- Serie temporal: los splits son tramos cronológicos (train → val → test). Nunca se mezclan ni se usa información posterior al instante que se predice. Los huecos solo se rellenan con valores pasados (`ffill`) y los datos se cortan en la última observación real del target.
- `test` no interviene en ninguna decisión (arquitectura, hiperparámetros, umbral, preprocesado); solo se usa en la evaluación final (`make evaluate`).
- El preprocesado se ajusta solo con train (`features.py`) y se guarda con el modelo.
- Toda métrica se compara con su referencia trivial (`baseline_*`): clase mayoritaria, media de train o, en series temporales, persistencia. Un modelo que no la supera no aporta nada.
- El análisis exploratorio usa solo train (`notebooks/01_eda.ipynb`).
- Una única implementación de carga y preprocesado: `src/oil_rnn/`.

## 3. Código

- Código e identificadores en inglés; documentación y comentarios en español.
- La lógica reutilizable está en `src/oil_rnn/`; los notebooks importan el paquete en lugar de copiar código.
- Rutas solo en `paths.py`; parámetros en `configs/`, nunca fijos en el código.
- PyTorch explícito, sin Lightning.
- Entorno conda `oil-rnn` (`environment.yml`); dependencias en `pyproject.toml` (Poetry). PyTorch se instala con `make install` (versión fijada en el `Makefile`), no con Poetry.
- Verificación:

  ```bash
  make test
  make lint
  ```

- No se afirma que algo funciona sin haberlo ejecutado. No se inventan métricas.

## 4. Experimentos

Cada entrenamiento es un run con id `<AAAAMMDD-HHMMSS>_<nombre>_<máquina>`, que nombra tres carpetas:

```text
runs/<id>/         config.yaml · meta.json (commit, máquina, hash de datos) · metrics.json(l) · train.log · eval_*.json
artifacts/<id>/    gráficas y predicciones
models/<id>/       pesos + preprocessor.joblib + model_card.json (fuera de git)
```

- Un run terminado no se reescribe; un cambio es un run nuevo.
- `make evaluate` usa la configuración guardada en el run.

## 5. Ejecución de comandos

**Claude ejecuta:** lectura e inspección, `make test`, `make lint`, scripts cortos (menos de unos 2 minutos) y comprobaciones de git que no modifican nada (`status`, `diff`, `log`).

**El usuario ejecuta**, con el comando exacto que le da Claude:

- instalaciones y entornos (`make setup`, `make install`, `poetry add`);
- descargas de datos (`make data`);
- entrenamientos, incluidos los cortos de prueba;
- notebooks;
- `git commit` y `git push`, salvo que pida explícitamente a Claude que haga el commit.

Si hay dudas sobre quién ejecuta algo, se pregunta.

Cada comando que debe ejecutar el usuario se añade como mensaje al final de `docs/COMANDOS.md` (máquina, fecha, ⏳/✅ y bloque para copiar). Cuando el usuario pasa la salida, Claude marca el mensaje como ✅ y anota el resultado en una línea.

## 6. Máquinas

| | Desarrollo (Mac) | Entrenamiento (GPU) |
|---|---|---|
| Función | Código, configs, tests, análisis, documentación | Entrenamientos |
| Escribe en | Todo el repositorio **excepto** `runs/` y `artifacts/` | **Solo** `runs/<id>/` y `artifacts/<id>/` |
| Git | Commit y push de código | Commit y push solo de su run |

- Claude identifica la máquina por la plataforma (`darwin` = Mac).
- La máquina de entrenamiento no edita código: si algo falla, se describe el error y se corrige en desarrollo.
- `git pull --rebase` antes de empezar y antes de cada push. En entrenamiento: `git add runs/<id> artifacts/<id>`, nunca `git add .`.
- Lo que cambia entre máquinas va en `.env`, nunca en el código.

## 7. Git

- Fuera del historial: `data/`, `models/`, pesos (`*.pt`, `*.keras`, `*.joblib`, `*.onnx`), bases de MLflow, `.env` y cachés.
- La CI (`.github/workflows/ci.yml`) ejecuta `make test` y `make lint` en cada push; debe quedar en verde.
- Conventional Commits. Commits solo cuando el usuario lo pida.

## 8. Web

- `web/` (Vite + TypeScript, ONNX Runtime Web). Su modelo, manifiesto y ejemplos se generan con `make export-web`.
- `web/src/model.ts` replica el preprocesado de `features.py`; cualquier cambio en uno se refleja en el otro y `make web-test` debe pasar.
- El modelo se publica como Release (`make web-release`), no en git.

## 9. Bibliografía

- Única fuente de citas: `docs/references.bib`, exportado por Zotero (Better BibTeX). No se edita a mano.
- Solo se citan entradas de `references.bib`. Nunca se inventan referencias, cifras ni resultados de artículos.
- Si una idea necesita un artículo que no está, se indica cuál (título, autores, DOI) para que el usuario lo añada a Zotero.
- Un resultado publicado justifica probar una idea, no garantiza que funcione aquí: la decisión se toma con validación interna.

## 10. Forma de responder

- Respuestas cortas y directas: primero la conclusión, después la justificación en pocas líneas.
- Una recomendación concreta en lugar de una lista de opciones equivalentes.
- Registro científico, sin expresiones de marketing. Cada término técnico con su significado preciso.
- Títulos que nombran el contenido, nunca de transición («De X a Y»).
- Se distingue siempre lo comprobado (ejecutado, medido) de lo supuesto o pendiente.
- Ante una propuesta técnica: qué pregunta responde, qué coste tiene y cómo se comprobaría. Si los resultados no permiten concluir, se dice.
- Español en la conversación y la documentación; inglés en el código.

## 11. Documentación

- `README.md`: presentación breve y visual de la solución. `docs/USAGE.md`: comandos por fases y por tareas. `CLAUDE.md`: reglas y forma de trabajo. `docs/`: enunciado (`assignment/`), bibliografía (`references.bib`) y presentación (`presentation/`).
- `docs/COMANDOS.md`: chat Mac ↔ Windows con los comandos que ejecuta el usuario en cada máquina (§5).
- `docs/PLAN.md`: única versión del plan del proyecto (fases, decisiones, orden de recorte). Los cambios de plan se editan ahí; no se mantienen copias en otro sitio.
- No se crean más documentos (planes, estados, registros…) sin petición explícita.
- Cuando cambia una regla, se edita su sección y queda solo la versión vigente.
