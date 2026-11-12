# Decisiones del proyecto oil-rnn

**Finalidad**: reunir cada decisión del trabajo con su motivo, su comprobación y su valoración, para poder defenderlo.
**Cuándo usarlo**: al preparar la exposición, antes de cambiar el método y al comparar con otro trabajo.
**Resultado**: 43 decisiones valoradas, la comparación con Brentcast y 8 mejoras sin ejecutar.
**Flujo**: Fuentes → Limpieza → Transformación → Ventanas → Validación → Modelo → Selección → Evaluación → Intervalo → Aplicación
**Estado**: 21 bien · 18 regular · 4 mal. Describe los runs `g1`, `g1s7`, `g1s123` y `final-*` (12/11/2026).

## 0. Antes de empezar: cómo leer este documento

- **Etiquetas**: cada decisión dice **Qué**, **Por qué**, **Alternativa**, **Comprobado** y **Valoración**.
- **Valoración**: Bien = defendible tal cual. Regular = defendible con una limitación que hay que decir. Mal = error o hueco que conviene admitir.
- **Cifras**: salen de `runs/<id>/metrics.json`, `runs/<id>/eval_test.json` y `data/splits.json`. Ninguna es nueva.
- **Sin motivo registrado**: se dice así cuando el motivo no consta en `docs/PLAN.md`, `configs/config.yaml` ni el código.
- **Test ya se evaluó** (12/11). Un cambio de método posterior se decide solo con validación y se declara.
- **Sin citas**: `docs/references.bib` está vacío. Los métodos se describen; no se atribuyen a ningún artículo.
- **Brentcast**: el trabajo de un compañero, `https://brentcast.vercel.app`. Sus datos salen de sus páginas `datos.html` y `resultados.html`.
- **Ver cada paso**: cuadernos `notebooks/02`–`05` y el explorador (`make explore`).

## 1. Fuentes: qué se descarga y qué se deja fuera

### 1.1 Variable objetivo: Brent spot de la EIA
- **Qué**: `DCOILBRENTEU` de FRED, columna `brent` (`data.target`).
- **Por qué**: lo fija el enunciado; el futuro de Yahoo solo existe desde 2007.
- **Alternativa**: ninguna razonable.
- **Comprobado**: 6501 filas, del 04/01/2000 al 03/11/2026 (`data/splits.json`).
- **Valoración**: Bien.

### 1.2 Calendario: solo los días con Brent
- **Qué**: `sources.fetch` conserva las filas con dato de `brent` (`data.source.calendar`).
- **Por qué**: el enunciado pide alinear las series con el calendario del Brent.
- **Alternativa**: Brentcast usa los 7001 días hábiles y descarta la muestra si falta el precio objetivo.
- **Comprobado**: de 7001 días hábiles, 500 no tienen Brent y no son filas.
- **Valoración**: Regular. «5 días hábiles» son aquí 5 filas con Brent, no 5 días de calendario laboral.

### 1.3 Variables externas: 14 columnas de FRED y Yahoo
- **Qué**: WTI, Henry Hub, tipo del BCE, dólar/euro, yuan/dólar, VIX, futuro del WTI (5 columnas), cobre, oro e índice del dólar.
- **Por qué**: es la lista del enunciado.
- **Alternativa**: menos variables. No se probó ningún subconjunto.
- **Comprobado**: no hay experimento de selección de variables.
- **Valoración**: Regular. No se sabe si las variables externas aportan algo frente a usar solo el Brent.

### 1.4 Futuro del Brent: excluido
- **Qué**: `brent_fut_*` se descarga pero no está en `data.features`.
- **Por qué**: empieza el 30/07/2007 y «su cierre repite el spot» (`config.yaml`).
- **Alternativa**: Brentcast lo usa como entrada y como referencia. Antes de 2007 usa el spot.
- **Comprobado**: no. El experimento con datos desde 2007 quedó como recortable en `docs/PLAN.md`.
- **Valoración**: Mal. Es la variable que explica casi toda la mejora de Brentcast a una semana (apartado 11).

### 1.5 Cesta OPEP: omitida
- **Qué**: no se descarga.
- **Por qué**: no tiene descarga automática en el código del profesor (`docs/PLAN.md`, fase 1).
- **Alternativa**: Brentcast la obtiene del XML de la OPEP, desde 2003.
- **Comprobado**: no.
- **Valoración**: Regular. El enunciado la nombra; hay que decir que falta.

### 1.6 Congelación: descarga del 11/11/2026
- **Qué**: `data.source.end: "2026-11-11"` y hash del archivo en `data/raw/_source.json`.
- **Por qué**: los splits no se mueven entre runs.
- **Alternativa**: descargar cada vez; los resultados dejarían de ser comparables.
- **Comprobado**: los 465 runs guardan el mismo hash de `dataset.csv` en `meta.json`.
- **Valoración**: Bien.

## 2. Limpieza: huecos, final de la serie y valores extremos

### 2.1 Huecos interiores: se repite el último valor (`ffill`)
- **Qué**: `data.fill_missing: ffill`, en `_split` de `data.py`.
- **Por qué**: lo indica el enunciado y solo usa valores pasados.
- **Alternativa**: Brentcast no rellena. Da a cada variable un indicador de disponibilidad y una caducidad.
- **Comprobado**: 12 709 celdas vacías antes de rellenar. Henry Hub tiene 1224 huecos interiores; WTI, 441.
- **Valoración**: Regular. Un valor repetido da rendimiento 0 ese día y la red no distingue «sin dato» de «sin cambio». Sigue marcado `PROVISIONAL`.

### 2.2 Comienzo de la serie: primera fila completa
- **Qué**: se descartan las 137 primeras filas; los datos empiezan el 30/08/2000.
- **Por qué**: `ffill` no puede rellenar antes del primer dato de cobre y oro.
- **Alternativa**: quitar esas columnas y empezar en enero de 2000.
- **Comprobado**: `rows_dropped_incomplete_start: 137` y `test_recorta_el_comienzo_incompleto_antes_de_dividir`.
- **Valoración**: Bien. Se pierden 8 meses de 26 años.

### 2.3 Final de la serie: último Brent publicado
- **Qué**: la última fila es el 03/11/2026, con descarga del 11/11.
- **Por qué**: la EIA publica con retraso; rellenar inventaría el precio que se predice.
- **Alternativa**: Brentcast mantiene los días recientes y actualiza el último spot con el futuro del Brent.
- **Comprobado**: todas las columnas terminan el 03/11. Si otras series tenían datos posteriores, el archivo no los conserva.
- **Valoración**: Regular. No se inventa nada, pero se descarta el mercado de hasta 6 días hábiles.

### 2.4 Retraso de publicación: no se modela
- **Qué**: la fila `t` supone conocidas todas las columnas del día `t`.
- **Por qué**: sin motivo registrado. Es el planteamiento del enunciado («precio futuro = precio de hoy»).
- **Alternativa**: Brentcast usa cada dato solo cuando ya estaba publicado (Brent: 7 días hábiles).
- **Comprobado**: no hay fuga dentro del experimento: predicción y referencia parten del mismo dato. No se midió el efecto en uso real.
- **Valoración**: Mal para el uso real, bien para la comparación. La predicción «a 5 días» parte de un precio de hace 8 días naturales.

### 2.5 WTI negativo: suelo de 1 $/barril
- **Qué**: `data.inputs.floor` en WTI y sus futuros.
- **Por qué**: el logaritmo exige precios positivos (20/04/2020: −37,63 $).
- **Alternativa**: Brentcast marca ese día como dato ausente.
- **Comprobado**: `test_suelo_para_valores_negativos`.
- **Valoración**: Regular. El suelo crea un rendimiento enorme ese día; el recorte de 3.4 lo limita.

## 3. Transformación: cómo entra cada variable en la red

### 3.1 Entradas: rendimiento logarítmico diario
- **Qué**: `log(x[t]/x[t−1])`. Excepciones: diferencia en el tipo del BCE y `log(1+x)` en el volumen.
- **Por qué**: el nivel no es estacionario; el precio va de unos 20 a 140 $.
- **Alternativa**: niveles. Test caería fuera del rango visto en train.
- **Comprobado**: `test_rendimientos_sin_futuro` y `notebooks/01_eda.ipynb` (nivel frente a rendimiento).
- **Valoración**: Bien. Brentcast hace lo mismo.

### 3.2 Entrada derivada: volatilidad móvil de 21 días
- **Qué**: desviación típica de los últimos 21 rendimientos del Brent (`brent_vol21`). Total: 16 entradas.
- **Por qué**: la anchura del intervalo depende del régimen de volatilidad.
- **Alternativa**: no añadirla.
- **Comprobado**: `test_volatilidad_solo_usa_el_pasado`. No se midió si mejora el intervalo.
- **Valoración**: Regular. Sin fuga, pero sin prueba de que aporte.

### 3.3 Escalado: media y desviación del tramo de ajuste
- **Qué**: estandarización en `Preprocessor.fit`, solo con las filas de ajuste de cada pliegue.
- **Por qué**: lo exige el enunciado; val y test no deben influir.
- **Alternativa**: escalar con toda la serie sería fuga de información.
- **Comprobado**: `train_model` ajusta el `Preprocessor` con `fit_df` en cada pliegue.
- **Valoración**: Bien.

### 3.4 Recorte: ±5 desviaciones
- **Qué**: `data.inputs.clip: 5` sobre las entradas estandarizadas.
- **Por qué**: el WTI de abril de 2020 llega a unas 120 desviaciones.
- **Alternativa**: no recortar, o eliminar esos días.
- **Comprobado**: `test_recorte_de_entradas_estandarizadas`. El límite es fijo, no ajustado con datos.
- **Valoración**: Bien.

### 3.5 Lo que aprende la red: rendimiento logarítmico a h días
- **Qué**: `log(P[t+h]/P[t])`, estandarizado (`data.target_mode: log_return`). El precio se reconstruye con `P[t]·exp(y)`.
- **Por qué**: un cambio relativo es comparable entre épocas. Salida 0 equivale a la persistencia.
- **Alternativa**: predecir el precio o la diferencia en dólares.
- **Comprobado**: `test_modo_cambio_reconstruye_el_nivel` y `test_ventanas_alineadas_sin_futuro`.
- **Valoración**: Bien. Brentcast también predice la desviación respecto a su referencia.

## 4. Ventanas: qué ve la red en cada predicción

### 4.1 Ventana: 60 filas
- **Qué**: `data.window: 60`. Cada ejemplo es una matriz de 60 × 16.
- **Por qué**: es el ejemplo del enunciado.
- **Alternativa**: 120. Estaba previsto compararlas en validación.
- **Comprobado**: no. La rejilla fija 60 y el valor sigue `PROVISIONAL`.
- **Valoración**: Regular. Brentcast también usa 60.

### 4.2 Alineación: la ventana termina en el día del pronóstico
- **Qué**: para predecir la fila `t+h` se usan las filas `t−59 … t`.
- **Por qué**: ninguna entrada puede ser posterior al momento de la predicción.
- **Alternativa**: ninguna válida.
- **Comprobado**: `test_ventanas_alineadas_sin_futuro`.
- **Valoración**: Bien.

### 4.3 Un modelo por horizonte
- **Qué**: cuatro redes independientes: 5, 21, 63 y 252 filas.
- **Por qué**: estrategia directa; el enunciado pide parámetros y tiempo por red y horizonte.
- **Alternativa**: una red con cuatro salidas, o predecir un día y encadenar.
- **Comprobado**: no se compararon estrategias.
- **Valoración**: Bien. El horizonte de 21 es un extra sobre el enunciado.

## 5. Validación: cómo se parte el tiempo

### 5.1 Tres tramos cronológicos: 70 % · 15 % · 15 %
- **Qué**: train 30/08/2000–22/04/2019, val 23/04/2019–24/01/2023, test 25/01/2023–03/11/2026.
- **Por qué**: test de 955 filas contiene 3 o 4 pronósticos independientes a 252 días.
- **Alternativa**: Brentcast empieza test el 02/01/2023 y deja 2022 como margen.
- **Comprobado**: `test_splits_cronologicos_sin_solapes`.
- **Valoración**: Bien. Los dos trabajos evalúan casi el mismo periodo.

### 5.2 Pliegues: 4 bloques de 2 años, ventana creciente
- **Qué**: `make cv` evalúa 4 bloques de 504 filas (23/02/2015–24/01/2023). Cada pliegue entrena con todo lo anterior.
- **Por qué**: un solo tramo de validación puede ir bien por azar; cada bloque tiene 2 pronósticos independientes a 252 días.
- **Alternativa**: ver 5.6. Brentcast usa 4 cortes de 1 año (2018–2021).
- **Comprobado**: `test_bloques_consecutivos_hasta_el_final`.
- **Valoración**: Bien. Cubre la caída de 2015, la pandemia y 2022.

### 5.3 Purga: `horizon` filas entre entrenamiento y evaluación
- **Qué**: `training_bounds` deja fuera los objetivos posteriores al primer día de pronóstico.
- **Por qué**: el objetivo de la fila `t` contiene el precio de `t+h`.
- **Alternativa**: sin purga, la red entrenaría con precios del bloque que predice.
- **Comprobado**: `test_purga_sin_targets_posteriores_al_origen`, para los cuatro horizontes.
- **Valoración**: Bien.

### 5.4 Parada temprana: el último año de cada entrenamiento
- **Qué**: `cv.holdout: 252`. Las 252 filas previas a la purga deciden la época; no ajustan pesos.
- **Por qué**: parar con el bloque de evaluación sería usar el futuro.
- **Alternativa**: Brentcast usa el último 15 % de cada historia.
- **Comprobado**: fechas del modelo final, calculadas con `training_bounds`:

| h | Ajuste hasta | Parada | Distancia a test |
|---|---|---|---|
| 5 | 12/01/2022 | 19/01/2022–18/01/2023 | 1 año |
| 21 | 25/11/2021 | 24/12/2021–22/12/2022 | 1,2 años |
| 63 | 29/07/2021 | 27/10/2021–25/10/2022 | 1,5 años |
| 252 | 31/01/2020 | 28/01/2021–25/01/2022 | 3 años |

- **Valoración**: Regular. El modelo de 252 días no ajustó sus pesos con la pandemia ni con 2022.

### 5.5 Sin reentrenar dentro del bloque
- **Qué**: la red de cada pliegue predice sus 2 años sin actualizarse.
- **Por qué**: sin motivo registrado. Reduce el coste: 4 entrenamientos por run.
- **Alternativa**: reentrenar cada mes o cada año.
- **Comprobado**: no se midió cuánto empeora el error al final de cada bloque.
- **Valoración**: Regular. A 5 días el modelo llega a tener 2 años de antigüedad.

### 5.6 Otras formas de validar: por qué no se usaron

| Esquema | Qué hace | Por qué no |
|---|---|---|
| Un solo tramo de validación | Train y un bloque | Una cifra; depende de un solo régimen |
| *k-fold* barajado | Mezcla fechas | Entrena con el futuro; no es válido en series |
| *Walk-forward* de ventana deslizante | Entrena con los últimos N años | No se probó; olvida regímenes antiguos |
| *Walk-forward* de ventana creciente | Entrena con todo lo anterior | Es el usado |
| Bloques con purga a ambos lados | Entrena también con datos posteriores | Más muestras, pero no imita el uso real |

- **Valoración**: Bien. La ventana creciente es la que pide el enunciado. La deslizante es una mejora razonable (apartado 12).

## 6. Modelo y pérdida: qué calcula la red

### 6.1 Arquitectura: celda recurrente y capa lineal
- **Qué**: `RNNRegressor`: RNN, LSTM o GRU apilada; el estado del último paso pasa a una capa lineal de 3 salidas.
- **Por qué**: es la comparación que pide el enunciado, con el mismo código para las tres.
- **Alternativa**: atención o media de todos los pasos. Fuera del enunciado.
- **Comprobado**: `test_cuantiles_ordenados` para las tres celdas.
- **Valoración**: Bien.

### 6.2 Salida: cuantiles 0,1 · 0,5 · 0,9
- **Qué**: la mediana es la predicción puntual; 0,1–0,9 es el intervalo del 80 %. Sin cruces por construcción.
- **Por qué**: el enunciado pide un rango de incertidumbre por predicción.
- **Alternativa**: Brentcast predice un valor y añade márgenes fijos calibrados en validación.
- **Comprobado**: `test_cuantiles_ordenados`.
- **Valoración**: Bien. El intervalo cambia con las entradas; el de márgenes fijos, no.

### 6.3 Pérdida: *pinball*
- **Qué**: para el cuantil `q`, `q·e` si `e ≥ 0` y `(q−1)·e` si no, con `e = real − previsto`.
- **Por qué**: su mínimo está en el cuantil `q`. Para la mediana equivale al error absoluto.
- **Alternativa**: error cuadrático, que estima la media y pesa más los extremos.
- **Comprobado**: `test_pinball`.
- **Valoración**: Regular. La red minimiza error absoluto y se informa RMSE: la métrica de la tabla no es la que se optimiza.

### 6.4 Entrenamiento: Adam, 60 épocas, paciencia 10, mínimo 10
- **Qué**: `train` en `config.yaml`. Lote de 64, `PROVISIONAL`.
- **Por qué**: `min_epochs: 10` corrige la parada prematura del trabajo anterior.
- **Alternativa**: más épocas o tasa de aprendizaje decreciente.
- **Comprobado**: en la configuración elegida a 5 días, la mejor época es la 1 o la 2 en los 4 pliegues.
- **Valoración**: Regular. La red deja de mejorar casi al empezar: señal de que hay poco que aprender, no de falta de épocas.

## 7. Selección: cómo se eligió cada red

### 7.1 Rejilla: 36 configuraciones iguales para las tres celdas
- **Qué**: oculto {32, 64, 128, 256} × {1 capa, 2 capas, 2 capas con dropout 0,3} × lr {1e-3, 3e-4, 1e-4}.
- **Por qué**: el enunciado pide condiciones iguales y presupuesto similar.
- **Alternativa**: búsqueda aleatoria o más valores. Brentcast hizo 1080 ajustes de validación.
- **Comprobado**: 432 runs `g1` terminados (36 × 3 celdas × 4 horizontes), semilla 42.
- **Valoración**: Bien.

### 7.2 Criterio: menor `cv_pinball`
- **Qué**: media de la pérdida *pinball* en los 4 pliegues.
- **Por qué**: mide a la vez la mediana y el intervalo.
- **Alternativa**: `cv_rmse`. Habría elegido por el error puntual, que es lo que compara el enunciado.
- **Comprobado**: `sweep.select_by: pinball`.
- **Valoración**: Regular. Es coherente con la pérdida, pero no con la métrica principal de la tabla.

### 7.3 Estabilidad: 3 semillas en los finalistas
- **Qué**: la mejor configuración de cada red y horizonte se repite con las semillas 7 y 123.
- **Por qué**: separar una diferencia real de la variación por inicialización.
- **Alternativa**: 3 semillas en toda la rejilla (1296 runs).
- **Comprobado**: 24 runs `g1s7` y `g1s123`. A 5 días la diferencia entre celdas es menor que la variación entre semillas.
- **Valoración**: Regular. La configuración ganadora se eligió con una sola semilla.

### 7.4 Optimismo de la selección: 108 candidatos por horizonte
- **Qué**: en cada horizonte se elige el mejor de 108 runs sobre los mismos 4 bloques.
- **Por qué**: sin motivo registrado; es consecuencia de la rejilla.
- **Alternativa**: reservar un bloque que la selección no vea.
- **Comprobado**: GRU a 63 días: +5,4 % en validación (pliegues −4,6 · +2,8 · +2,6 · +20,9 %) y −61 % en test.
- **Valoración**: Mal. La única mejora de validación venía de un pliegue y no se repitió. Brentcast declara el mismo riesgo.

### 7.5 Regla fijada antes de mirar test
- **Qué**: en cada horizonte, la red con menor `cv_pinball` medio en 3 semillas.
- **Por qué**: una regla elegida después de ver test usaría test.
- **Alternativa**: ninguna válida.
- **Comprobado**: el commit `docs(plan): modelo elegido por horizonte` es anterior a `chore(runs): modelos finales y evaluación en test`.
- **Valoración**: Bien. Es el punto más sólido de la defensa.

## 8. Evaluación: con qué se compara y qué salió

### 8.1 Referencia puntual: persistencia
- **Qué**: «el precio dentro de h días es el de hoy» (`y_baseline`).
- **Por qué**: lo fija el enunciado. Un modelo que no la mejora no aporta.
- **Alternativa**: Brentcast añade el «ingenuo con futuros», más difícil de batir.
- **Comprobado**: `skill_vs_baseline = 1 − RMSE red / RMSE persistencia` en cada run.
- **Valoración**: Bien.

### 8.2 Referencias del intervalo y de la dirección
- **Qué**: cuantiles históricos del rendimiento a h días en train; dirección más frecuente en train.
- **Por qué**: la persistencia no da intervalo ni dirección.
- **Alternativa**: intervalo según la volatilidad reciente.
- **Comprobado**: `test_metricas_de_intervalo_y_direccion`.
- **Valoración**: Bien. Pocas comparaciones incluyen una referencia para el intervalo.

### 8.3 Test: una sola evaluación
- **Qué**: `make evaluate SPLIT=test` una vez por modelo final, el 12/11.
- **Por qué**: repetirla la convertiría en otra validación.
- **Alternativa**: ninguna válida.
- **Comprobado**: un `eval_test.json` por run `final-*`:

| h | Red | Mejora RMSE | Mejora *pinball* | Dirección (red / referencia) | Cobertura (red / referencia) |
|---|---|---|---|---|---|
| 5 | GRU | −3,6 % | −1,4 % | 51 % / 50 % | 78 % / 79 % |
| 21 | LSTM | −8,1 % | −6,7 % | 54 % / 49 % | 86 % / 84 % |
| 63 | GRU | −61 % | −39 % | 60 % / 44 % | 68 % / 86 % |
| 252 | RNN | −45 % | −34 % | 44 % / 33 % | 92 % / 92 % |

- **Valoración**: Bien el procedimiento. El resultado es negativo y se dice así.

### 8.4 Significación estadística: no se calculó
- **Qué**: no hay contraste ni intervalo de confianza de las mejoras.
- **Por qué**: quedó como recortable en `docs/PLAN.md`.
- **Alternativa**: Brentcast da IC del 95 % por remuestreo de bloques y un contraste de Diebold-Mariano.
- **Comprobado**: no.
- **Valoración**: Regular. A 252 días hay 3 o 4 pronósticos independientes en test; ninguna cifra es fiable.

## 9. Intervalo: calibración conforme

### 9.1 Corrección del intervalo con los bloques de validación
- **Qué**: `conformal.py` ensancha o estrecha el intervalo, en proporción, hasta cubrir el 80 % en los 4 bloques.
- **Por qué**: los cuantiles de la red no garantizan cobertura fuera de train.
- **Alternativa**: márgenes fijos (Brentcast) o ninguna corrección.
- **Comprobado**: mediana de la rejilla, cobertura sin corregir → corregida: 78 → 79 % (h=5), 73 → 81 %, 62 → 81 %, 48 → 94 % (h=252).
- **Valoración**: Bien. Cada pliegue se corrige solo con los anteriores (`test_calibracion_por_pliegues_solo_con_el_pasado`).

### 9.2 Supuesto de intercambiabilidad: no se cumple del todo
- **Qué**: la garantía exige que los errores pasados y futuros se parezcan.
- **Por qué**: los rendimientos a h días se solapan y la volatilidad cambia de régimen.
- **Alternativa**: corrección adaptativa, que se actualiza con los errores recientes.
- **Comprobado**: en 2026 la cobertura cae al 48–58 % en los tres horizontes cortos (`README.md`).
- **Valoración**: Regular. Brentcast sufre la misma caída en 2026.

## 10. Aplicación: qué enseña Sonda

### 10.1 Web estática con inferencia en el navegador
- **Qué**: los 4 modelos en ONNX; `web/src/model.ts` replica `features.py`.
- **Por qué**: sin servidor que mantener.
- **Alternativa**: Streamlit, el ejemplo del enunciado («aplicación en Python»).
- **Comprobado**: `make web-test`, 15 pruebas de paridad con Python.
- **Valoración**: Regular. **Pendiente**: confirmar con el profesor que una web estática vale.

### 10.2 Fecha del pronóstico: cuenta desde el último dato
- **Qué**: Sonda muestra el último precio (03/11) y cuenta el horizonte desde ese día.
- **Por qué**: es coherente con cómo se entrenó (2.4).
- **Alternativa**: Brentcast pronostica desde hoy, con el spot actualizado por futuros.
- **Comprobado**: `Sonda.fan(market.last, forecasts, sel, market.ts)` en `web/src/main.ts`; la fecha objetivo del panel sale de `Sonda.tradingDays(m.ts, h)`.
- **Valoración**: Regular. El texto dice la fecha del último precio, pero el pronóstico a 1 semana ya ha vencido al publicarse.

### 10.3 Actualización y reentrenamiento: sin hacer
- **Qué**: fase 7 de `docs/PLAN.md`, sin empezar.
- **Por qué**: orden de fases acordado.
- **Alternativa**: Brentcast ejecuta su flujo cada mañana laborable con GitHub Actions.
- **Comprobado**: no existe el workflow.
- **Valoración**: Mal hasta que se haga: es un requisito del enunciado.

### 10.4 Portal con dinero ficticio
- **Qué**: vista Mercado y, tras el icono de cartera de la cabecera, pestañas Posiciones, Calculadora e Historial.
  - Cartera simulada de 10.000 $ con solo posiciones largas, abiertas y cerradas al último precio exportado.
  - «Si hubiera invertido» un día desde 2000.
  - «Si hubiera seguido al modelo» en test: tramos de `h` días sin solape; invierte si la previsión supera al precio del origen.
  - Evaluaciones en un recuadro modal.
  - Historial descargable en CSV o JSON.
- **Por qué**: el usuario quiere un portal completo; traducir la previsión a dólares de una posición hace visible lo que vale (o no) el modelo.
- **Alternativa**: servidor con cuentas y precios en vivo; descartado porque la web es estática (10.1).
- **Comprobado**: 10 pruebas de `web/tests/portal.test.ts` (cálculos, CSV, exportar e importar); en el navegador, 1.000 $ el 21/04/2020 valen 11.735,75 $ (9,12 → 107,03 $/bbl).
- **Valoración**: Regular.
  - Los precios están congelados en la última exportación: no hay evolución diaria hasta la fase 7.
  - El estado vive solo en el navegador; sin el JSON exportado se pierde al borrar los datos del sitio.
  - «Seguir al modelo» usa el backtest de test solo para mostrarlo, nunca para decidir.

## 11. Comparación con Brentcast: en qué acierta cada uno

La columna «Mejor» es criterio propio: gana quien se acerca más al uso real o mide con más garantías.

| Aspecto | oil-rnn | Brentcast | Mejor |
|---|---|---|---|
| Momento de la predicción | Último Brent publicado | Hoy a las 09:00, con retrasos por fuente | Brentcast |
| Futuro del Brent | Excluido | Entrada y referencia | Brentcast |
| Huecos | `ffill` | Indicador de disponibilidad y caducidad | Brentcast |
| Cesta OPEP | No | Sí | Brentcast |
| Horizontes | 5, 21, 63 y 252 | 5, 63 y 252 | oil-rnn |
| Validación | 4 bloques de 2 años, 2015–2023 | 4 cortes de 1 año, 2018–2021 | oil-rnn |
| Intervalo | Cuantiles de la red y corrección conforme | Márgenes fijos | oil-rnn |
| Referencia del intervalo | Cuantiles históricos | No consta | oil-rnn |
| Significación | No | IC del 95 % y Diebold-Mariano | Brentcast |
| Semillas en test | 1 | Media de 3 | Brentcast |
| Actualización diaria | No | Sí | Brentcast |

### 11.1 Por qué Brentcast mejora a una semana y oil-rnn no
- **Su cifra**: +19 % sobre el ingenuo del enunciado y 70 % de acierto de dirección.
- **Su origen**: actualizar el último spot con el futuro logra cerca del 20 % sin red. Sus redes quedan un 2 % por debajo de esa regla.
- **Qué significa**: la mejora viene de conocer el mercado de los días que la EIA aún no ha publicado, no de la red.
- **No son comparables**: él predice el spot desde un dato con 7 días de retraso; aquí se predice desde el último dato.

### 11.2 En qué coinciden los dos trabajos
- **3 meses y 1 año**: ninguna red mejora de forma fiable a la referencia.
- **Celdas**: RNN, LSTM y GRU rinden casi igual.
- **2026**: la cobertura del intervalo cae.
- **Selección**: los dos declaran el riesgo de elegir entre muchos experimentos con la misma validación.

## 12. Mejoras valoradas: ninguna ejecutada

| Mejora | Pregunta que responde | Coste | Cómo se comprobaría |
|---|---|---|---|
| Referencia «ingenuo con futuros» | ¿Cuánto del error a 5 días es retraso de publicación? | Bajo: sin entrenar, datos desde 2007 | RMSE en los 4 bloques frente a la persistencia |
| Datos «as-of» con `brent_fut_*` | ¿Mejora la red con el mercado de los últimos días? | Alto: splits, rejilla y web nuevos | `cv_pinball` y `skill` en validación |
| Indicador de disponibilidad | ¿Empeora `ffill` las entradas? | Medio: `features.py` y `model.ts` | Mismo run con y sin indicador, 3 semillas |
| Cesta OPEP | ¿Aporta la variable que falta? | Medio: descarga nueva | Mismo run con y sin ella |
| Ventana deslizante | ¿Ayuda olvidar regímenes antiguos? | Bajo: un parámetro en `cv.py` | `cv_pinball` de los finalistas |
| Diebold-Mariano e IC por bloques | ¿Son las diferencias distintas de cero? | Bajo: solo cálculo sobre predicciones guardadas | p-valor por horizonte |
| Solo el Brent como entrada | ¿Aportan algo las 14 variables externas? | Bajo: 12 runs de `make cv` | `cv_pinball` frente a los finalistas |

### 12.1 Ventas adelantadas: qué parte de la idea se puede traer
- **La idea** (del usuario): en demanda, una compra adelantada no es demanda nueva; se quita del pico para no inflar la serie.
- **Por qué no se traslada tal cual**: en ventas se reparte una cantidad entre periodos. Un precio no es una cantidad acumulable; no hay total que conservar.
- **Además**: el mercado descuenta lo anunciado. La subida anterior a un suceso esperado ya es el precio real, no un pico ficticio.
- **Qué sí se traslada**: separar movimientos transitorios, que se deshacen, de cambios de nivel, que se quedan.
- **Ya cubierto**: `floor` y `clip` limitan el WTI de abril de 2020; la pérdida *pinball* pesa poco los extremos.
- **Sin cubrir**: los saltos del futuro continuo al cambiar de contrato, que son artificiales. Brentcast los cita como limitación.
- **Propuesta**: una entrada que marque los días de cambio de contrato, o excluir el rendimiento de ese día.
- **Cómo se comprobaría**: mismo run de `make cv` con y sin la marca, 3 semillas.
- **Límite**: no se puede concluir sin el experimento.

## 13. Verificar: lista antes de defender una cifra

- [ ] La cifra está en `runs/<id>/metrics.json`, `eval_test.json` o `data/splits.json`.
- [ ] Va junto a su referencia (`baseline_*`).
- [ ] Se dice si es de validación o de test.
- [ ] Si es de 252 días, se dice que hay 3 o 4 pronósticos independientes.
- [ ] Ninguna decisión se justifica con una cifra de test.
