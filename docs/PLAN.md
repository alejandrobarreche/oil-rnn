# Plan del proyecto oil-rnn (Caso III · entrega 20/11/2026)

## Contexto

El enunciado pide comparar RNN simple, LSTM y GRU para predecir el Brent a 5, 63 y 252 días hábiles, con incertidumbre, frente a persistencia, e integrar el mejor modelo en una aplicación que calcule, explique y se actualice. Entregables: repositorio, aplicación funcional y 5 diapositivas.

Estado comprobado del repositorio: estructura, descarga (`data/raw/dataset.csv` existe), red `RNNRegressor` con una salida, `Preprocessor` con ventana y un solo horizonte, métricas con `baseline_*`, web base con ONNX. Sin splits ni runs. Ocho valores `PENDIENTE` en `configs/config.yaml`.

Decisiones ya tomadas por el usuario:

- Aplicación: web estática + GitHub Actions para datos y reentrenamiento. **Supuesto a confirmar con el profesor**: el enunciado dice «aplicación en Python».
- Rúbrica: se asume la anterior (Repositorio 10 · Red 10 · Modelo y test 15 · App 5 · Resultados 20 · PPT 10 · Oral 30). No se sabe cómo se medirá «Resultados».
- Alcance: Brent, horizontes 5, 21, 63 y 252 días (21 es un extra).
- Web: dos páginas independientes. **Sonda** (predicción, sistema de diseño existente) y **página explicativa** (animación, 3D), donde va lo diferencial.
- GPU propia disponible. Presentación y oral: los prepara el usuario.

### Qué corrige del trabajo anterior

| Fallo en breast-cnn | Equivalente aquí | Medida en este plan |
|---|---|---|
| Modelo colapsado en la respuesta segura («no pCR») | Red que devuelve «cambio ≈ 0», es decir, persistencia disfrazada | Toda métrica junto a persistencia, por horizonte; se declara en qué horizontes no hay mejora |
| Umbral no pensado para el objetivo | Intervalos no calibrados | Cuantiles + calibración en validación; cobertura del 80 % medida |
| AUC de test casi al azar tras buen proceso | Buena validación en un tramo, mala en otro | Walk-forward con varios pliegues y error por régimen antes de tocar test |
| Menos de 10 épocas | Early stopping prematuro | `train.min_epochs: 10` |
| (Acierto) capacidad elegida con datos | — | Se mantiene: tamaños comparados por brecha train/val |

## Fase 0 · Enunciado y decisiones (día 1)

1. Guardar la transcripción ya obtenida en `docs/assignment/ENUNCIADO.md`.
2. Resolver los `PENDIENTE` de `configs/config.yaml`. Propuesta (la aprobación de este plan las fija, salvo las marcadas «fase 1»):

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

## Fase 1 · Datos y EDA, solo train (días 1–2)

- `make prepare` y `notebooks/01_eda.ipynb` (los ejecuta el usuario).
- Preguntas que responde: huecos por columna y fecha de inicio útil (`brent_fut` empieza ~2007), tratamiento del WTI negativo (20/04/2020), estacionariedad de niveles frente a rendimientos, autocorrelación de rendimientos a cada horizonte, volatilidad por régimen.
- Salida: lista de `data.features` y transformaciones (rendimientos logarítmicos, volatilidad móvil) en `features.py`, replicadas después en `web/src/model.ts`.
- Cesta OPEP: sin descarga automática. Se omite y se dice en el README, salvo que el usuario aporte un CSV en `data/external/`.
- Sucesos del ciclo económico (2008, 2014–16, 2020, 2022, 2026): el usuario añade las fuentes a Zotero; no se redacta ninguna causa sin entrada en `docs/references.bib`.

## Fase 2 · Pipeline de modelado (días 2–3)

Cambios mínimos sobre lo existente:

- `src/oil_rnn/features.py` — `Preprocessor`: `target_mode: log_return`, features derivadas, `n_outputs` = número de cuantiles.
- `src/oil_rnn/model.py` — `RNNRegressor`: cabeza con 3 salidas (cuantiles 0,1 · 0,5 · 0,9), pérdida *pinball*, `min_epochs`; registrar número de parámetros y tiempo de entrenamiento con `run.log_metrics`.
- `src/oil_rnn/data.py` + `cv.py` — `make cv`: 4 pliegues *walk-forward* de ventana creciente sobre train+val, con bloques de evaluación de 2 años (2015–2023), purga de `horizon` filas en cada frontera y *early stopping* con el último año de cada entrenamiento; test queda fuera. `make train` = modelo final con train+val por el mismo procedimiento.
- `src/oil_rnn/metrics.py` — `compute_metrics`: añadir MSE, acierto de dirección, cobertura del 80 %, anchura del intervalo y *pinball*; referencia de intervalo = cuantiles históricos del rendimiento a h días en train.
- Calibración conforme de los cuantiles (CQR, corrección relativa en log) con las predicciones de los 4 bloques de `make cv`; su cobertura se mide corrigiendo cada pliegue solo con los anteriores. `make train CALIB=<run de cv>` la guarda con el modelo (exige la misma configuración). Referencia pendiente de añadir a Zotero.
- Tests nuevos en `tests/`: ningún target de train posterior al fin de train; ninguna ventana usa filas posteriores a t−h; cuantiles no cruzados; inversa de `log_return`.

## Fase 3 · Comparativa RNN · LSTM · GRU (días 3–5, GPU)

- Condiciones iguales: mismos datos, ventana, pliegues y la misma rejilla de hiperparámetros y semillas para las tres celdas (tamaño oculto, capas, dropout, tasa de aprendizaje).
- Rejilla decidida (11/11, `sweep` en `configs/config.yaml`, `make sweep`): oculto {32, 64, 128, 256} × [1 capa | 2 capas, dropout 0 | 2 capas, dropout 0,3] × lr {1e-3, 3e-4, 1e-4} = 36 configuraciones × 3 celdas × 4 horizontes = 432 runs de `make cv`, semilla 42, 60 épocas con paciencia 10. Criterio de selección: `cv_pinball` (media de los 4 pliegues). Ventana 60 fija en la rejilla.
- Capacidad elegida por brecha train/val, como en el trabajo anterior.
- Finalistas con 3 semillas para medir estabilidad.
- El usuario lanza los entrenamientos con los comandos exactos; cada uno es un run (`runs/<id>/`).
- Salida: tabla red × horizonte con MAE, RMSE, mejora frente a persistencia, parámetros y tiempo, todo en validación.

## Fase 4 · Selección y evaluación final (día 5)

- Elección del modelo por horizonte con validación; conclusión escrita de dónde aporta valor y dónde no (previsiblemente poco a 252 días; se comprueba, no se supone).
- Elección decidida (12/11), antes de mirar test: en cada horizonte, la red con menor `cv_pinball` medio en 3 semillas (42, 7, 123), con la configuración ganadora de la rejilla `g1`. Modelo final con semilla 42 y la calibración del run de cv de esa configuración.

| h | Red | Configuración (oculto, capas, dropout, lr) | Calibración (`CALIB`) | Conclusión en cv |
|---|---|---|---|---|
| 5 | GRU | 256, 1, 0, 1e-3 | `20261112-004459_g1-gru-h5-…` | Intervalo mejor que el histórico; predicción puntual sin mejora; las tres celdas empatan |
| 21 | LSTM | 64, 1, 0, 1e-4 | `20261111-232334_g1-lstm-h21-…` | Sin mejora sobre la persistencia |
| 63 | GRU | 128, 2, 0,3, 1e-4 | `20261112-012653_g1-gru-h63-…` | `skill_rmse` +4,8 % ± 0,6 % en 3 semillas |
| 252 | RNN | 256, 2, 0,3, 1e-4 | `20261111-225050_g1-rnn-h252-…` | Peor que la persistencia (−4,3 %); intervalo sobrecubre (90 %) |

- Resultado en test (12/11, runs `final-*`, una sola evaluación): ninguna red supera a la persistencia (`skill_rmse` −3,6 %, −8,1 %, −61 %, −45 %). Tablas y conclusión en `README.md`. Mejora de RMSE por año de test:

| h | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|
| 5 | −2,3 % | −4,1 % | +0,2 % | −4,3 % |
| 21 | −5,8 % | +4,0 % | −12,7 % | −9,0 % |
| 63 | −58 % | −70 % | −93 % | −59 % |
| 252 | −112 % | −47 % | −22 % | +9,2 % |

- La aplicación muestra la red elegida en los cuatro horizontes y dice en el texto que, medida en 2023–2026, no mejora a la persistencia; el dato más fiable es el intervalo a 5 días.
- `make evaluate` una sola vez sobre test: métricas, cobertura real del intervalo, error por régimen. Contraste de Diebold-Mariano frente a persistencia si queda tiempo (requiere añadir la referencia a Zotero).
- Tabla definitiva en `README.md`.

## Fase 5 · Sonda, la aplicación de predicción (días 4–7, en paralelo con datos simulados)

- `make export-web` ampliado: cuatro ONNX, manifiesto y JSON con la forma de `contrato-de-datos.md` del sistema de diseño (predicción con `lo80/hi80`, calidad con `coverage80` y *backtest*).
- `web/`: integrar tokens y componentes de Sonda (artefacto `GJGpkQEKJT4ZGuDxg49E3H`), reducido a Brent y cuatro horizontes; fuera intradía, 1D, selector de activos, curva de futuros y alertas.
- Requisitos del enunciado: selector de horizonte, histórico con sucesos marcados, precio previsto, variación, intervalo del 80 %, texto para usuario no técnico (plantilla alimentada por la fiabilidad medida en la fase 4 y por los factores obtenidos por oclusión de variables en el navegador).
- El abanico entre horizontes se interpola y los cuatro puntos calculados se marcan como tales.
- `web/src/model.ts` replica `features.py`; `make web-test` en verde.

## Fase 6 · Página explicativa: el elemento diferencial (días 6–8)

Segunda ruta de `web/`, con lenguaje visual propio, animación y 3D. El diseño se detalla al empezar la fase (con `frontend-design`), no ahora. Contenido previsto, todo con datos reales exportados en las fases 1–4:

1. La serie y su ciclo económico.
2. Cómo entra el dato en la red: ventana deslizante y pliegues walk-forward.
3. Qué hace por dentro una RNN, una LSTM y una GRU.
4. Por qué la persistencia es difícil de batir y qué gana cada red en cada horizonte.
5. Qué significa el intervalo y cómo se comprobó.

Coste que conviene conocer: la rúbrica da un 5 % a «App»; esta página rinde sobre todo en la exposición oral (30 %).

## Fase 7 · Actualización, reentrenamiento y repositorio (días 8–9)

- Workflow programado de GitHub Actions: `make data` diario y publicación de los últimos datos; reentrenamiento manual o periódico del modelo elegido con su configuración guardada, exportación y Release. Requiere una regla nueva en `CLAUDE.md` §6 (Actions como tercera «máquina»).
- `README.md` y `docs/USAGE.md` al día; CI en verde.

## Fase 8 · Presentación y exposición (usuario)

La prepara el usuario. El proyecto solo aporta las cifras y figuras de las fases 4–6.

## Orden de recorte si falta tiempo

1. Experimento con `brent_fut_*`. 2. Diebold-Mariano. 3. Ventana 120. 4. Reentrenamiento periódico (queda manual). 5. Capítulos 4–5 de la página explicativa pasan a figuras estáticas. Nunca se recorta: comparativa completa, evaluación final en test y Sonda con los horizontes del enunciado.

## Verificación

- `make test` y `make lint` tras cada fase de código; `make web-test` tras las fases 5 y 6.
- Fase 2: prueba de humo de entrenamiento (la lanza el usuario) con las tres celdas.
- Fase 4: `runs/<id>/eval_*.json` contiene, por horizonte, `rmse`, `baseline_rmse`, `skill_vs_baseline` y cobertura; el README solo cita esas cifras.
- Fases 5–7: `make web-dev` y comprobación en el navegador de que la predicción del navegador coincide con la de `Predictor` para los ejemplos exportados; ejecución manual del workflow de actualización.
