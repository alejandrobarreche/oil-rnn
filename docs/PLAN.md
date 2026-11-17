# Plan del proyecto oil-rnn

## Resumen

Entrega el 20/11/2026: repositorio, aplicación y 5 diapositivas. Están hechas la comparativa, la evaluación en test, la web de previsión, la página explicativa y la actualización diaria. Falta la presentación.

## Fases

| Fase | Estado | Resultado |
| --- | --- | --- |
| 0–2. Decisiones, datos y pipeline | Hecha | Configuración fijada y código de entrenamiento |
| 3. Comparar RNN, LSTM y GRU | Hecha | 432 entrenamientos y finalistas con 3 semillas |
| 4. Evaluar en test | Hecha | Ninguna red mejora a la persistencia; R² y mejora por año en el README |
| 5. Aplicación | Hecha | Previsión a 4 plazos en un clic en [GitHub Pages](https://alejandrobarreche.github.io/oil-rnn/) |
| 5b. Documento de decisiones | Hecha | Explorador revisado por el usuario |
| 6. Página explicativa | Hecha | «El precio del Brent» (`web/public/brent/`): 8 capítulos con índice, paleta del producto y paso «Año a año» |
| 7. Actualización diaria | Hecha | `make update` y workflow diario, sin reentrenar, como acepta el profesor; lanzado a mano en verde |
| 8. Presentación | Pendiente | 5 diapositivas y su guion |

## Pendientes

- [ ] Presentación: 5 diapositivas sin portada (problema y oportunidad, solución, comparativa de las tres redes, demostración con los tres horizontes y propuesta de valor) y su guion.
- [ ] Ver en Actions la primera actualización automática con datos nuevos: commit `chore(data)` y nueva publicación de la web.
- [ ] Averiguar cómo se puntúa «Resultados» en la rúbrica.

## Decidido sin hacer

- **Bibliografía de la calibración conforme**: el usuario no aporta la referencia. Se describe el método sin citar ningún artículo; `docs/references.bib` solo tiene Diebold y Mariano (1995) y Harvey, Leybourne y Newbold (1997).
- **Causa del suceso de 2026**: no se documenta; la web lo dice así.

## Al cerrar cada fase

- [ ] Pasan `make test` y `make lint`; también `make web-test` si se tocó la web.
- [ ] La predicción del navegador coincide con la de Python.
- [ ] El README solo cita cifras guardadas en los runs.
