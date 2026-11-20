# Decisiones del proyecto oil-rnn

## Resumen

Cuatro redes recurrentes, una por plazo, elegidas con validación walk-forward (432 entrenamientos y una segunda rejilla de 72 configuraciones a 3 meses y 1 año) y evaluadas en test al final, de 2023 a 2026. En test ninguna diferencia con la persistencia es significativa (Diebold-Mariano, p > 0,05), y la red añade lo que la persistencia no da: un intervalo del 80 % que cubre del 78 % al 97 % de los casos según el plazo. A 1 año la validación detecta que no hay señal y el modelo da el precio de hoy en vez de inventar movimiento.

El procedimiento es sólido: splits cronológicos, preprocesado ajustado solo con train, elección de modelos solo con validación y cada cifra frente a su referencia trivial. Lo que queda por mejorar está en los datos (apartado Mejoras pendientes).

Sistema de diseño: [Sonda](https://claude.ai/artifact/GJGpkQEKJT4ZGuDxg49E3H).

## Resultado en test

Modelos publicados, test de 2023 a 2026 (955 días).

| h | Red | Mejora RMSE validación | Mejora RMSE test | Cobertura 80 % (red / referencia) | Acierto de dirección (red / mayoritaria de train) | p (error cuadrático) |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | GRU-16 | −0,4 % | −1,8 % | 78 % / 79 % | 49 % / 50 % | 0,32 |
| 21 | LSTM-64 | +0,0 % | −8,1 % | 86 % / 84 % | 54 % / 49 % | 0,46 |
| 63 | GRU-64, 2 capas, 5 semillas, w = 0,6 | +3,1 % | −11,6 % | 83 % / 86 % | 53 % / 44 % | 0,39 |
| 252 | RNN-16, 5 semillas, w = 0 | 0,0 % | 0,0 % | 97 % / 92 % | 33 % / 33 % | — |

- **Significación**: ninguna diferencia con la persistencia es significativa. A 63 y 252 días solo hay unos 15 y 3 pronósticos independientes: «no significativo» no es «igual», y no se puede decir que la red sea peor ni mejor.
- **Intervalo**: cubre entre el 78 % y el 97 %, con un ancho que depende de las entradas de cada día. Es lo que la persistencia no ofrece.
- **Dirección**: a 1 mes y a 3 meses la red acierta si el precio sube o baja más a menudo que la dirección más frecuente en train.
- **63 días**: la rejilla g2 (redes pequeñas, media de 5 semillas y contracción elegida en validación) bajó el error de test de −61 % a −11,6 % y mejora a la red anterior en los cuatro años (2023: −3 %, 2024: −11 %, 2025: −29 %, 2026: −12 %; antes, de −58 % a −93 %). El rendimiento medio predicho baja de +11,1 % a +5,3 %; el real es +1,7 %.
- **252 días**: en validación, w = 0 es la mejor en las 36 configuraciones. El modelo no inventa movimiento: da el precio de hoy con el intervalo de la red, que cubre el 97 %.
- **5 días**: la GRU-16 sustituyó a la GRU-256 (−3,6 % en test, p = 0,22). El cambio se decidió en validación, antes de ver esta cifra: empatan dentro de la variación entre semillas y la de 16 es 125 veces más pequeña.

Primera versión a 63 y 252 días (rejilla g1), sustituida por la g2. La regla de elección de g2 se fijó en git antes de entrenar y se publican las dos evaluaciones.

| h | Red | Mejora RMSE test | Cobertura 80 % (red / referencia) | p (error cuadrático) |
| --- | --- | --- | --- | --- |
| 63 | GRU-128, 2 capas | −61 % | 68 % / 86 % | 0,27 |
| 252 | RNN-256, 2 capas | −45 % | 92 % / 92 % | 0,40 |

## Decisiones

| Etapa | Decisión | Por qué | Límite |
| --- | --- | --- | --- |
| Fuentes | Usar solo los días con precio del Brent | El target solo existe esos días; un calendario único evita inventar precios del Brent. | Un horizonte de 5 días son 5 días con dato, no 5 días laborables. |
| Fuentes | Usar las 14 variables externas del enunciado | Cubren los factores del crudo: WTI y su futuro, gas, divisas, tipos, metales y volatilidad de los mercados. | No se comprobó si mejoran algo frente a usar solo el Brent. |
| Limpieza | Cortar la serie en el último Brent publicado | Cada fila tiene target real y nada posterior al instante predicho. | Se pierden hasta 6 días de mercado que ya se conocían. |
| Limpieza | Rellenar los huecos con el último valor conocido | Es un relleno que no usa información del futuro. | La red no distingue un día sin dato de un día sin cambio. |
| Limpieza | Poner un mínimo de 1 $ al WTI, que llegó a −37 $ | El logaritmo exige precios positivos. | Ese día aparece un salto enorme; lo acota el recorte a ±5 desviaciones. |
| Transformación | Añadir la volatilidad del último mes como entrada | Dice a la red cuánto se mueve el precio, para que el intervalo pueda abrirse en los días agitados. | No se midió si mejora el intervalo. |
| Ventanas | Dar a la red los últimos 20 días (60 en el modelo de 1 mes) | Con redes pequeñas, 20 y 60 dan lo mismo en validación; la corta cuesta menos. | No se probó una ventana más larga, como 120. |
| Validación | Decidir cuándo parar de entrenar con el último año de datos | Evita sobreajustar sin tocar el bloque que se evalúa. | El modelo a 1 año no aprendió de la pandemia ni de 2022. |
| Validación | No reentrenar dentro de cada bloque de 2 años | Reproduce el uso real: se entrena una vez y se predicen los dos años siguientes. | Al final del bloque el modelo tiene 2 años de antigüedad. |
| Modelo | Entrenar con la pérdida *pinball* para los cuantiles 10, 50 y 90 % | Un solo modelo da la mediana y el intervalo del 80 %. | Los resultados se dan también en RMSE. |
| Modelo | Entrenar hasta 60 épocas (400 a 1 semana) con parada temprana | El entrenamiento se corta cuando el error del año reservado deja de bajar, para no memorizar ruido. | Las redes finales paran entre las épocas 5 y 11, salvo la GRU-16 de 1 semana (184). |
| Selección | Elegir cada red por su pérdida *pinball* en validación | Es la pérdida con la que se entrena y mide mediana e intervalo a la vez. | No es la métrica principal de la tabla de resultados. |
| Selección | Repetir con 3 semillas solo las finalistas | Separa diferencias reales de la variación por inicialización con un coste acotado. | La configuración ganadora de g1 se eligió con una sola semilla. |
| Modelo | Rejilla g2 a 63 y 252 días: redes de 16 a 64 unidades y media de 5 semillas | Las redes de g1 tenían 155.000 y 202.000 parámetros para unos 15 y 3 pronósticos independientes; redes pequeñas y 5 semillas reducen la varianza. | 72 combinaciones. |
| Modelo | Contraer la predicción hacia la persistencia: rendimiento predicho × w, con w ∈ [0, 1] elegido en validación | Corrige la escala con un solo parámetro; con w = 0 el modelo es la persistencia si la red no aporta. La w de cada pliegue se elige solo con los anteriores. | Corrige la escala, no la dirección. |
| Selección | En g2, elegir por el RMSE de validación con la contracción (pliegues 2 a 4) | Es la métrica de la tabla de resultados. La regla de elección y `--finalize` quedaron en git antes de entrenar. | Test ya se había evaluado con los modelos g1; se publican las dos evaluaciones. |
| Selección | A 5 días, GRU de 16 unidades en vez de 256 | Empatan en validación (3 semillas; diferencia menor que la variación entre semillas) y la de 16 es 125 veces más pequeña. | El modelo final se entrenó en el Mac, no en la GPU. |
| Intervalo | Ajustar el ancho del intervalo con los datos de validación (conformal) | Calibra la cobertura al 80 % con datos que la red no vio al entrenar. | En 2026, con la subida brusca del precio, cubre el 62 % a 1 semana, el 52 % a 1 mes y el 32 % a 3 meses. |
| Web | Enseñar la previsión a 4 plazos (p50 y franja p10–p90 desde hoy), sin compra ni modo «En el pasado» | Enseña lo que el modelo sabe dar, mediana y rango, con la cobertura de test de cada plazo junto a la de la persistencia: quien la usa sabe cuánto fiarse. | No se enseñan días pasados concretos. |
| Actualización | Renovar cada día los datos de la web (`make update` y un workflow diario) sin reentrenar | La previsión parte siempre del último dato publicado, sin el coste de reentrenar. | Las redes no aprenden de los datos nuevos; reentrenar es `make train`, a mano. |

## Mejoras pendientes

Hechas: referencia «ingenuo con futuros» y contraste de Diebold-Mariano. Quedan, de menor a mayor coste:

| Mejora | Pregunta | Coste |
| --- | --- | --- |
| Solo el Brent como entrada | ¿Aportan las 14 variables externas? | Bajo |
| Ventana deslizante | ¿Ayuda olvidar regímenes antiguos? | Bajo |
| IC por bloques | ¿Confirma el resultado de Diebold-Mariano? | Bajo |
| Indicador de disponibilidad | ¿Empeora `ffill` las entradas? | Medio |
| Cesta OPEP | ¿Aporta la variable que falta? | Medio |
| Marca de cambio de contrato | ¿Meten ruido los saltos del futuro continuo? | Medio |
| Datos con `brent_fut_*` y retrasos reales | ¿Mejora la red con el mercado reciente? | Alto |

## Antes de defender una cifra

- [ ] Está en `metrics.json`, `eval_test.json` o `splits.json`.
- [ ] Va junto a su referencia.
- [ ] Se dice si es de validación o de test.
- [ ] Si es a 252 días, se dice que hay 3 o 4 pronósticos independientes.
- [ ] Ninguna decisión se justifica con test.
