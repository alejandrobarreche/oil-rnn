# Plan del proyecto oil-rnn

## Resumen

Entrega el 20/11/2026: repositorio, aplicación y 5 diapositivas. Están hechas la comparativa, la evaluación en test y Sonda. Faltan la página explicativa y la actualización diaria.

Sistema de diseño: [Sonda](https://claude.ai/artifact/GJGpkQEKJT4ZGuDxg49E3H).

## Fases

| Fase | Estado | Resultado |
| --- | --- | --- |
| 0–2. Decisiones, datos y pipeline | Hecha | Configuración fijada y código de entrenamiento |
| 3. Comparar RNN, LSTM y GRU | Hecha | 432 entrenamientos y finalistas con 3 semillas |
| 4. Evaluar en test | Hecha | Ninguna red mejora a la persistencia |
| 5. Sonda | Hecha | Publicada en [GitHub Pages](https://alejandrobarreche.github.io/oil-rnn/), con portal de dinero ficticio |
| 5b. Documento de decisiones | Hecha | Falta revisar a mano el explorador |
| 6. Página explicativa | Sin empezar | Definida, sin plan visual aprobado |
| 7. Actualización diaria | Sin empezar | — |
| 8. Presentación | La prepara el usuario | — |

## Pendientes

- [ ] Ver en pantalla las vistas de 1 mes, 3 meses y 1 año de Sonda.
- [ ] Añadir a la bibliografía la referencia de la calibración conforme.
- [ ] Escribir la causa del suceso de 2026.
- [ ] Averiguar cómo se puntúa «Resultados» en la rúbrica.

## Página explicativa

Recorrido en página web donde contamos:
1. Contexto y objetivo del proyecto.
2. Qué es Brent y sucesos históricos que afectan al precio.
3. Datos importantes para entender los movimientos del precio de mercado.
4. Soluciones posibles para predecir el precio del Brent y cómo se comparan.
5. Definir la solución elegida y detallar cómo funciona.
6. Explicar la arquitectura de la red elegida y cómo se entrena.
7. Mostrar la predicción de Sonda y cómo se actualiza cada día.
8. Conclusiones y posibles mejoras.

### Pendiente
- [ ] Definir el plan visual de la página.
- [ ] Hacer la página web y publicarla en GitHub Pages.

## Actualización diaria

La pide el enunciado y está sin empezar.

- [ ] Descargar los datos cada día con GitHub Actions y publicarlos en Sonda.
- [ ] Reentrenar el modelo elegido, a mano o cada cierto tiempo, y publicar la nueva versión.
- [ ] Añadir a `CLAUDE.md` la regla de GitHub Actions.
- [ ] Poner al día `README.md` y `docs/USAGE.md`.

## Si falta tiempo

Se recorta en este orden:

1. Probar el futuro del Brent como entrada.
2. Probar una ventana de 120 días.
3. Reentrenar cada cierto tiempo (queda a mano).
4. Dejar los capítulos 4 y 5 de la página explicativa como figuras fijas.

Nunca se recorta: la comparativa completa, la evaluación en test y Sonda con los horizontes del enunciado.

## Al cerrar cada fase

- [ ] Pasan `make test` y `make lint`; también `make web-test` si se tocó la web.
- [ ] La predicción del navegador coincide con la de Python.
- [ ] El README solo cita cifras guardadas en los runs.
- [ ] El workflow de actualización funciona lanzado a mano.
