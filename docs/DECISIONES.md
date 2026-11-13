# Decisiones del proyecto oil-rnn

## Resumen

Resultado: ninguna red mejora a la persistencia en test, y ninguna diferencia es significativa. El procedimiento es sólido; los huecos están en los datos y en el uso real.

Sistema de diseño: [Sonda](https://claude.ai/artifact/GJGpkQEKJT4ZGuDxg49E3H).

## Fallos del proyecto

| Decisión | Fallo |
| --- | --- |
| Futuro del Brent excluido | Es la variable que más informa sobre los próximos días y no se probó como entrada. |
| Retraso de publicación no modelado | En uso real, la predicción a 5 días parte de un precio de hace 8 días. Una regla sin red con 1 día de futuros gana a la persistencia un 8,5 %, más que cualquier red. |
| Huecos rellenados con el último valor | La red no distingue un día sin dato de un día sin cambio. Faltó un indicador de si el dato existe. |
| Sin cesta OPEP | El enunciado la pide y no está. |
| Selección entre 108 candidatos | GRU a 63 días: +5,4 % en validación gracias a un solo pliegue; −61 % en test. |
| Test con una sola semilla | El resultado puede depender de la inicialización. Faltó promediar varias semillas. |
| Sin actualización diaria | Lo pide el enunciado. La fase 7 está sin empezar. |

## Resultado en test

Las cuatro redes tienen más error que la persistencia, pero ninguna diferencia es significativa (Diebold-Mariano, p > 0,05).

| h | Red | Mejora RMSE | Cobertura 80 % (red / referencia) | p (error cuadrático) |
| --- | --- | --- | --- | --- |
| 5 | GRU | −3,6 % | 78 % / 79 % | 0,22 |
| 21 | LSTM | −8,1 % | 86 % / 84 % | 0,46 |
| 63 | GRU | −61 % | 68 % / 86 % | 0,27 |
| 252 | RNN | −45 % | 92 % / 92 % | 0,40 |

A 63 y 252 días solo hay unos 15 y 3 pronósticos independientes. «No significativo» no es «igual»: no se puede decir que la red sea peor ni mejor.

## Decisiones

| Etapa | Decisión | Límite |
| --- | --- | --- |
| Fuentes | Usar solo los días con precio del Brent | Un horizonte de 5 días son 5 días con dato, no 5 días laborables. |
| Fuentes | Usar las 14 variables externas del enunciado | No se comprobó si mejoran algo frente a usar solo el Brent. |
| Limpieza | Cortar la serie en el último Brent publicado | Se pierden hasta 6 días de mercado que ya se conocían. |
| Limpieza | Poner un mínimo de 1 $ al WTI, que llegó a −37 $ | Ese día aparece un salto enorme; solo lo suaviza el recorte de valores extremos. |
| Transformación | Añadir la volatilidad del último mes como entrada | No se midió si mejora el intervalo. |
| Ventanas | Dar a la red los últimos 60 días | No se probó una ventana más larga, como 120. |
| Validación | Decidir cuándo parar de entrenar con el último año de datos | El modelo a 1 año no aprendió de la pandemia ni de 2022. |
| Validación | No reentrenar dentro de cada bloque de 2 años | Al final del bloque el modelo tiene 2 años de antigüedad. |
| Modelo | Entrenar minimizando el error absoluto (pérdida *pinball*) | Los resultados se dan en otra métrica, el RMSE. |
| Modelo | Entrenar hasta 60 épocas | La red deja de mejorar en la época 1 o 2: aprende poco. |
| Selección | Elegir cada red por su pérdida *pinball* en validación | No es la métrica de la tabla de resultados. |
| Selección | Repetir con 3 semillas solo las finalistas | La configuración ganadora se eligió con una sola semilla. |
| Intervalo | Ajustar el ancho del intervalo con los datos de validación | En 2026 cubre solo el 48–58 % de los casos, en vez del 80 %. |

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
