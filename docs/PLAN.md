# Plan del proyecto oil-rnn

**Finalidad**: única versión del plan del Caso III: fases, decisiones tomadas y orden de recorte.
**Cuándo usarlo**: al empezar una sesión, antes de una decisión de proyecto y al cerrar cada fase.
**Resultado**: repositorio, aplicación funcional y 5 diapositivas, entregados el 20/11/2026.
**Flujo**: Fase 0 Decisiones → 1 Datos → 2 Pipeline → 3 Comparativa → 4 Evaluación → 5 Sonda → 5b Decisiones y explorador → 6 Página explicativa → 7 Actualización → 8 Presentación
**Estado**: fases 0–5 y 5b hechas · 6 y 7 sin empezar · Diebold-Mariano e «ingenuo con futuros» hechos (13/11) · siguiente: decidir el resto de mejoras de `docs/DECISIONES.md` (apartado 12).

## 0. Antes de empezar: encargo, estado y decisiones del usuario

### 0.1 Encargo
- **Qué pide el enunciado**: comparar RNN simple, LSTM y GRU para predecir el Brent a 5, 63 y 252 días hábiles, con incertidumbre, frente a persistencia.
- **Aplicación**: integrar el mejor modelo en una aplicación que calcule, explique y se actualice.
- **Entregables**: repositorio, aplicación funcional y 5 diapositivas.

### 0.2 Estado de cada fase (12/11/2026, punto de partida de la próxima sesión)

| Fase | Estado | Dónde está |
|---|---|---|
| 0–2 · Decisiones, datos, pipeline | Hecha | `configs/config.yaml`, `src/oil_rnn/` |
| 3 · Comparativa | Hecha: rejilla `g1` (432 runs de cv) y finalistas con 3 semillas | `runs/*_g1-*`, `runs/*_g1s7-*`, `runs/*_g1s123-*`, `make compare` |
| 4 · Evaluación final | Hecha: ninguna red supera a la persistencia en test | runs `final-*`, tablas en `README.md` |
| 5 · Sonda | Hecha y publicada en https://alejandrobarreche.github.io/oil-rnn/ (Release `model-v1`) | `web/`, `make export-web` |
| 5b · Decisiones y explorador | Hecha; cuadernos ejecutados (13/11); falta la revisión visual de `make explore` | `docs/DECISIONES.md`, `notebooks/02`–`05`, `app/explorador.py` |
| 6 · Página explicativa | Sin empezar | — |
| 7 · Actualización y reentrenamiento | Sin empezar | — |

- **Orden acordado con el usuario** (12/11): la fase 5b va antes que las fases 6 y 7; el rediseño de Sonda, en otra sesión.
- **Fase 5b**: documentar primero y decidir después. Las mejoras de `docs/DECISIONES.md` (apartado 12) no se ejecutan sin decisión del usuario.
- **Figuras para la fase 6**: las de `src/oil_rnn/explore_plots.py` cubren los capítulos 1 a 5 de la página explicativa.

### 0.3 Decisiones del usuario
- **Aplicación**: web estática + GitHub Actions para datos y reentrenamiento.
  **Pendiente**: confirmar con el profesor; el enunciado dice «aplicación en Python».
- **Rúbrica**: se asume la anterior (Repositorio 10 · Red 10 · Modelo y test 15 · App 5 · Resultados 20 · PPT 10 · Oral 30). No se sabe cómo se medirá «Resultados».
- **Alcance**: Brent, horizontes 5, 21, 63 y 252 días (21 es un extra).
- **Web**: dos páginas independientes. **Sonda** (predicción, sistema de diseño existente) y **página explicativa** (animación, 3D), donde va lo diferencial.
- **Recursos**: GPU propia disponible. Presentación y oral: los prepara el usuario.

### 0.4 Fallos de breast-cnn que corrige este plan

| Fallo en breast-cnn | Equivalente aquí | Medida en este plan |
|---|---|---|
| Modelo colapsado en la respuesta segura («no pCR») | Red que devuelve «cambio ≈ 0», es decir, persistencia disfrazada | Toda métrica junto a persistencia, por horizonte; se declara en qué horizontes no hay mejora |
| Umbral no pensado para el objetivo | Intervalos no calibrados | Cuantiles + calibración en validación; cobertura del 80 % medida |
| AUC de test casi al azar tras buen proceso | Buena validación en un tramo, mala en otro | Walk-forward con varios pliegues y error por régimen antes de tocar test |
| Menos de 10 épocas | Early stopping prematuro | `train.min_epochs: 10` |
| (Acierto) capacidad elegida con datos | — | Se mantiene: tamaños comparados por brecha train/val |

## 1. Fase 0 · Enunciado y decisiones (día 1): valores de configuración fijados

1. Guardar la transcripción ya obtenida en `docs/assignment/ENUNCIADO.md`.
2. Resolver los `PENDIENTE` de `configs/config.yaml`. La aprobación de este plan fija la propuesta, salvo lo marcado «fase 1»:

| Clave | Propuesta | Motivo |
|---|---|---|
| `data.target` | `brent` | Enunciado |
| `data.time_column` | `date` | Columna que escribe `sources.fetch` |
| `data.horizon` | 5, 21, 63, 252: un modelo por horizonte (`--set data.horizon=N`) | Estrategia directa; el enunciado pide parámetros y tiempo por red y horizonte |
| `data.target_mode` | `log_return` (nuevo): log(P[t]/P[t−h]) | El precio va de ~20 a ~140 $; el cambio relativo es comparable entre épocas |
| `data.window` | 60 de partida; 60 frente a 120 se decide en validación | Ejemplo del enunciado |
| `data.val_size` / `test_size` | 0,15 / 0,15 (test ≈ últimos 3,8 años) | Test necesita 3–4 pronósticos independientes a 252 días |
| `data.source.end` | `2026-11-11` (fecha de la descarga) | Congela el dataset: los splits no se mueven entre runs |
| `data.features` | Todas salvo `brent_fut_*`; los datos empiezan en la primera fila completa (~ago. 2000) | `brent_fut` solo existe desde 2007 (sin fuente gratuita anterior) y su cierre repite el spot. Experimento opcional: con datos desde 2007, con y sin `brent_fut_*` |

## 2. Fase 1 · Datos y EDA, solo train (días 1–2): features y transformaciones

- **Ejecución**: `make prepare` y `notebooks/01_eda.ipynb` (los ejecuta el usuario).
- **Preguntas**: huecos por columna y fecha de inicio útil (`brent_fut` empieza ~2007); tratamiento del WTI negativo (20/04/2020); estacionariedad de niveles frente a rendimientos; autocorrelación de rendimientos a cada horizonte; volatilidad por régimen.
- **Salida**: lista de `data.features` y transformaciones (rendimientos logarítmicos, volatilidad móvil) en `features.py`, replicadas después en `web/src/model.ts`.
- **Cesta OPEP**: sin descarga automática. Se omite y se dice en el README, salvo que el usuario aporte un CSV en `data/external/`.
- **Sucesos del ciclo económico** (2008, 2014–16, 2020, 2022, 2026): el usuario aporta las fuentes; no se redacta ninguna causa sin entrada en `docs/references.bib`.

## 3. Fase 2 · Pipeline de modelado (días 2–3): cambios mínimos sobre lo existente

- **`src/oil_rnn/features.py`** — `Preprocessor`: `target_mode: log_return`, features derivadas, `n_outputs` = número de cuantiles.
- **`src/oil_rnn/model.py`** — `RNNRegressor`: cabeza con 3 salidas (cuantiles 0,1 · 0,5 · 0,9), pérdida *pinball*, `min_epochs`. Registrar número de parámetros y tiempo de entrenamiento con `run.log_metrics`.
- **`src/oil_rnn/data.py` + `cv.py`** — `make cv`: 4 pliegues *walk-forward* de ventana creciente sobre train+val, con bloques de evaluación de 2 años (2015–2023). Purga de `horizon` filas en cada frontera y *early stopping* con el último año de cada entrenamiento; test queda fuera.
- **`make train`**: modelo final con train+val por el mismo procedimiento.
- **`src/oil_rnn/metrics.py`** — `compute_metrics`: añadir MSE, acierto de dirección, cobertura del 80 %, anchura del intervalo y *pinball*. Referencia de intervalo: cuantiles históricos del rendimiento a h días en train.
- **Calibración conforme** de los cuantiles (CQR, corrección relativa en log) con las predicciones de los 4 bloques de `make cv`. Su cobertura se mide corrigiendo cada pliegue solo con los anteriores. `make train CALIB=<run de cv>` la guarda con el modelo (exige la misma configuración).
  **Pendiente**: añadir la referencia de CQR a `docs/references.bib`.
- **Tests nuevos** en `tests/`: ningún target de train posterior al fin de train; ninguna ventana usa filas posteriores a t−h; cuantiles no cruzados; inversa de `log_return`.

## 4. Fase 3 · Comparativa RNN · LSTM · GRU (días 3–5, GPU): misma rejilla para las tres

- **Condiciones iguales**: mismos datos, ventana, pliegues y la misma rejilla de hiperparámetros y semillas para las tres celdas (tamaño oculto, capas, dropout, tasa de aprendizaje).
- **Rejilla** (decidida el 11/11; `sweep` en `configs/config.yaml`, `make sweep`): oculto {32, 64, 128, 256} × [1 capa | 2 capas, dropout 0 | 2 capas, dropout 0,3] × lr {1e-3, 3e-4, 1e-4}.
- **Tamaño**: 36 configuraciones × 3 celdas × 4 horizontes = 432 runs de `make cv`, semilla 42, 60 épocas con paciencia 10. Ventana 60 fija en la rejilla.
- **Criterio de selección**: `cv_pinball` (media de los 4 pliegues).
- **Capacidad**: elegida por brecha train/val, como en el trabajo anterior.
- **Estabilidad**: finalistas con 3 semillas.
- **Ejecución**: el usuario lanza los entrenamientos con los comandos exactos; cada uno es un run (`runs/<id>/`).
- **Salida**: tabla red × horizonte con MAE, RMSE, mejora frente a persistencia, parámetros y tiempo, todo en validación.

## 5. Fase 4 · Selección y evaluación final (día 5): ninguna red supera a la persistencia en test

### 5.1 Elegir el modelo por horizonte con validación
- **Objetivo**: conclusión escrita de dónde aporta valor y dónde no (previsiblemente poco a 252 días; se comprueba, no se supone).
- **Regla** (decidida el 12/11, antes de mirar test): en cada horizonte, la red con menor `cv_pinball` medio en 3 semillas (42, 7, 123), con la configuración ganadora de la rejilla `g1`.
- **Modelo final**: semilla 42 y la calibración del run de cv de esa configuración.

| h | Red | Configuración (oculto, capas, dropout, lr) | Calibración (`CALIB`) | Conclusión en cv |
|---|---|---|---|---|
| 5 | GRU | 256, 1, 0, 1e-3 | `20261112-004459_g1-gru-h5-…` | Intervalo mejor que el histórico; predicción puntual sin mejora; las tres celdas empatan |
| 21 | LSTM | 64, 1, 0, 1e-4 | `20261111-232334_g1-lstm-h21-…` | Sin mejora sobre la persistencia |
| 63 | GRU | 128, 2, 0,3, 1e-4 | `20261112-012653_g1-gru-h63-…` | `skill_rmse` +4,8 % ± 0,6 % en 3 semillas |
| 252 | RNN | 256, 2, 0,3, 1e-4 | `20261111-225050_g1-rnn-h252-…` | Peor que la persistencia (−4,3 %); intervalo sobrecubre (90 %) |

### 5.2 Evaluar una sola vez en test
- **Procedimiento**: `make evaluate` una sola vez sobre test: métricas, cobertura real del intervalo, error por régimen.
- **Resultado** (12/11, runs `final-*`): ninguna red supera a la persistencia (`skill_rmse` −3,6 %, −8,1 %, −61 %, −45 %). Tablas y conclusión en `README.md`.
- **Mejora de RMSE por año de test**:

| h | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| 5 | −2,3 % | −4,1 % | +0,2 % | −4,3 % |
| 21 | −5,8 % | +4,0 % | −12,7 % | −9,0 % |
| 63 | −58 % | −70 % | −93 % | −59 % |
| 252 | −112 % | −47 % | −22 % | +9,2 % |

- **En la aplicación**: la red elegida en los cuatro horizontes, con el texto de que, medida en 2023–2026, no mejora a la persistencia. El dato más fiable es el intervalo a 5 días.
- **Diebold-Mariano** frente a persistencia (13/11, `make dm`): la red tiene más error en los 4 horizontes, pero ninguna diferencia es significativa al 5 % (p entre 0,09 y 0,46). Detalle en `docs/DECISIONES.md` 8.4.
- **Tabla definitiva**: en `README.md`.

## 6. Fase 5 · Sonda, la aplicación de predicción (días 4–7): hecha y publicada

Se desarrolla en paralelo, con datos simulados.

### 6.1 Alcance
- **`make export-web` ampliado**: cuatro ONNX, manifiesto y JSON con la forma de `contrato-de-datos.md` del sistema de diseño (predicción con `lo80/hi80`, calidad con `coverage80` y *backtest*).
- **`web/`**: integrar tokens y componentes de Sonda (artefacto `GJGpkQEKJT4ZGuDxg49E3H`), reducido a Brent y cuatro horizontes; fuera intradía, 1D, selector de activos, curva de futuros y alertas.
- **Requisitos del enunciado**: selector de horizonte, histórico con sucesos marcados, precio previsto, variación, intervalo del 80 % y texto para usuario no técnico.
- **Texto para el usuario**: plantilla alimentada por la fiabilidad medida en la fase 4 y por los factores obtenidos por oclusión de variables en el navegador.
- **Abanico**: entre horizontes se interpola; los cuatro puntos calculados se marcan como tales.
- **Paridad**: `web/src/model.ts` replica `features.py`; `make web-test` en verde.

### 6.2 Decisiones de la interfaz (12/11)
- **Motor**: `bundle.js` de Sonda (motor de gráficos, iconos y clases `bx-*`), alimentado con los datos exportados; desde el rediseño lleva cambios locales (6.6).
- **Vistas de dominio** (cabecera, tarjetas, medidor, factores, rendimiento): se construyen en `web/src/main.ts` con sus clases.
- **Fuera**: columna de activos, alertas, curva de futuros, comparador de modelos e intradía.
- **Medidor de dirección**: con zona «Sin sesgo claro» (probabilidad de subida entre 45 % y 55 %). Al lado, el acierto de dirección en test frente a la dirección constante más frecuente.
- **Panel de rendimiento**: cada métrica junto a su referencia.
- **Sucesos del ciclo económico** (`web.events` en `config.yaml`): fecha y precio salen de los datos. Las causas son solo las que da el enunciado, sin fuentes externas: el usuario decide no usar Zotero. La de 2026 queda sin documentar.

### 6.3 Pasos, todos hechos el 12/11
1. Exportación de los 4 modelos, `market.json` y `quality.json`.
2. Inferencia y paridad de los 4 en el navegador.
3. Interfaz con Sonda.
4. Texto para el usuario.
5. Ciclo económico.

Comprobados con `make test`, `make lint`, `make web-test` (15/15), compilación, capturas de la vista de 1 semana y despliegue en GitHub Pages.

### 6.4 Cómo está construida la web, para el rediseño
- **`web/src/sonda/`**: `bundle.js` y `bundle.css` copiados del sistema de diseño (Sonda 2); `tokens.css` generado desde su `tokens.json`. `bundle.js` lleva cambios locales (6.6): si el sistema de diseño cambia, hay que volver a aplicarlos.
- **`web/src/main.ts`**: carga los datos, ejecuta los 4 modelos y construye las vistas.
- **`web/src/style.css`**: composición (dos columnas, apilado por debajo de 1100 px). **`web/index.html`**: estructura.
- **`web/src/explain.ts`** (tests en `web/tests/explain.test.ts`): abanico interpolado en log-precio, P(subida) suponiendo log-precio normal, factores por oclusión (entrada fijada a su media de train) y sesgo del backtest.
- **`web/src/model.ts`**: réplica de `features.py`; no se toca en un rediseño (paridad con `make web-test`).
- **Datos**: `web/public/data/market.json` (histórico, sucesos, últimas 81 filas) y `quality.json` (métricas de test frente a referencias y backtest); los genera `make export-web`.

### 6.5 Lo que muestra hoy (datos al 3/11/2026)
- **Predicción**: +4,1 % a 1 semana, +9,2 % a 1 mes y +63 % a 3 meses y a 1 año.
- **Texto**: el de cada horizonte sale de las métricas de test (no mejora a la persistencia, sesgo alcista, intervalo a un solo lado), no de frases fijas.
- **Sin revisar**: no se han visto en captura las vistas de 1 mes, 3 meses y 1 año.

### 6.6 Rediseño y portal con dinero ficticio (rama `feat/web-redesign`, 12/11)
- **Rediseño**: Sonda 2 (temas claro y oscuro). El gráfico va arriba y ocupa el alto de la pantalla; el horizonte se elige con un control segmentado.
- **Cambios locales en `bundle.js`**: sin los datos de ejemplo, selector Línea | Velas (velas de cierres: el Brent spot solo tiene un precio al día), degradado bajo la línea, fecha objetivo en las tarjetas y herramienta de medir corregida (un clic sin arrastrar no guarda nada, solo queda la última medición y vuelve al cursor).
- **Portal** (`web/src/portal/`): cartera simulada (icono en la cabecera) con pestañas Posiciones, Calculadora e Historial, evaluaciones en recuadro modal e historial descargable en CSV y JSON; decisión en `DECISIONES.md` 10.4.
  - `sim.ts` y `store.ts` son lógica pura con pruebas.
  - `modal.ts` usa `<dialog>`.
  - `index.ts` contiene rutas y vistas.
  - Los tipos de Sonda se comparten en `web/src/sonda.ts`.
- **Comprobado**: `make web-test` (25/25) y recorrido en Chrome (1288×800 y 1900×1000, temas claro y oscuro).

## 7. Fase 6 · Página explicativa (días 6–8): el elemento diferencial

Segunda ruta de `web/`, con lenguaje visual propio, animación y 3D. El diseño se detalla al empezar la fase (con `frontend-design`), no ahora. Contenido previsto, todo con datos reales exportados en las fases 1–4:

1. La serie y su ciclo económico.
2. Cómo entra el dato en la red: ventana deslizante y pliegues walk-forward.
3. Qué hace por dentro una RNN, una LSTM y una GRU.
4. Por qué la persistencia es difícil de batir y qué gana cada red en cada horizonte.
5. Qué significa el intervalo y cómo se comprobó.

- **Coste**: la rúbrica da un 5 % a «App»; esta página rinde sobre todo en la exposición oral (30 %).

## 8. Fase 7 · Actualización, reentrenamiento y repositorio (días 8–9): workflow programado y documentación al día

- **Workflow programado de GitHub Actions**: `make data` diario y publicación de los últimos datos.
- **Reentrenamiento**: manual o periódico del modelo elegido con su configuración guardada, exportación y Release.
  **Pendiente**: regla nueva en `CLAUDE.md` (Actions como tercera «máquina»).
- **Documentación**: `README.md` y `docs/USAGE.md` al día; CI en verde.

## 9. Fase 8 · Presentación y exposición: la prepara el usuario

El proyecto solo aporta las cifras y figuras de las fases 4–6.

## 10. Recortar si falta tiempo: orden fijo

1. Experimento con `brent_fut_*`.
2. Diebold-Mariano: hecho el 13/11.
3. Ventana 120.
4. Reentrenamiento periódico (queda manual).
5. Capítulos 4–5 de la página explicativa pasan a figuras estáticas.

- **Nunca se recorta**: comparativa completa, evaluación final en test y Sonda con los horizontes del enunciado.

## 11. Verificar: comprobaciones por fase

- [ ] `make test` y `make lint` tras cada fase de código; `make web-test` tras las fases 5 y 6.
- [ ] Fase 2: prueba de humo de entrenamiento (la lanza el usuario) con las tres celdas.
- [ ] Fase 4: `runs/<id>/eval_*.json` contiene, por horizonte, `rmse`, `baseline_rmse`, `skill_vs_baseline` y cobertura; el README solo cita esas cifras.
- [ ] Fases 5–7: `make web-dev` y comprobación en el navegador de que la predicción coincide con la de `Predictor` para los ejemplos exportados.
- [ ] Fases 5–7: ejecución manual del workflow de actualización.
