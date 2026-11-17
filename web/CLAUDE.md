# web

Web del proyecto en dos partes: el producto (previsión del Brent a 4 plazos en una pantalla y un clic, Vite + TypeScript + ONNX Runtime Web) y el estudio, «El precio del Brent» (desarrollo del trabajo con scroll, Three.js, D3 y KaTeX). Las reglas generales están en el `CLAUDE.md` de la raíz.

## Reglas clave

**Siempre**
- Usa los tokens que ya existen: los de `src/product.css` en el producto y las variables `--sc-*` de `public/brent/index.html` en el estudio.
- Mantén el producto en una pantalla sin scroll en escritorio, con una sola acción principal. Las métricas van en la fila de cada plazo; el pie solo lleva la fuente de los datos, sin enlaces repetidos.
- El producto solo tiene tema claro y el estudio solo oscuro; compruébalo en el navegador en escritorio y móvil.
- Haz que cada pantalla responda una pregunta con una cifra o un gráfico de datos reales; el texto solo nombra lo que se ve.
- Usa un objeto 3D solo si su forma o su movimiento enseñan el concepto (una ventana que avanza, un estado que pasa de un día al siguiente, un rango que se abre); si no, un gráfico 2D.
- Explica la red con sus datos reales: entradas, salida, error frente a la persistencia y curva de entrenamiento.
- Muestra cada cifra del modelo junto a su referencia trivial y di si es de validación o de test.
- Enseña el cambio visual al usuario en el navegador antes de darlo por bueno.

**Nunca**
- No añadas texto para explicar un gráfico que no se entiende: rehaz el gráfico.
- No pases de una idea y 25 palabras por paso de scroll, ni de una línea por subtítulo de tarjeta.
- No pongas etiquetas que repitan lo que ya dice el contenido (p. ej. «en palabras» sobre un texto, «Cuánto falló» sobre un gráfico de error).
- No pongas explicaciones en `title`: en móvil no se ven. Escríbelas a la vista o quítalas.
- No repitas en un subtítulo lo que ya dice el título o la cabecera de la tabla; quítalo.
- No añadas escenas ni objetos 3D sin dato del proyecto detrás; usa un gráfico o elimina la escena.
- No uses «·» como separador en ningún texto; usa una coma, «a», «de» o dos frases.
- No uses dorado, ámbar, azul petróleo ni acentos azules en el producto, ni halos o brillos de color en botones, campos o foco; el foco es un contorno neutro.
- No bajes de 13 px en ningún texto ni de 44 px de alto en los botones de acción.

## Comandos

```bash
make web-test      # Tests de web/ (los ejecuta Claude)
make web-dev       # Servidor de desarrollo (lo ejecuta el usuario)
make web-build     # Compilación a web/dist (lo ejecuta el usuario)
```

## Arquitectura

| Ruta | Qué contiene |
|---|---|
| `index.html`, `src/main.ts` | Producto: gráfico SVG de la serie real con el tramo futuro (un hueco por plazo); antes de prever, una ventana recorre la serie; «Prever con las 4 redes» (ONNX) abre la franja p10–p90 plazo a plazo. Barra de herramientas (rango, escala, medias 50 y 200, sucesos, previsión en test frente a la persistencia) y panel del plazo elegido con sus métricas de test |
| `src/forecast.ts` | Cálculos sin DOM: plazos, fechas hábiles, escala, marcas del eje, media móvil, posición de los plazos y cobertura |
| `src/model.ts` | Réplica del preprocesado de `features.py` e inferencia ONNX |
| `src/icons.ts` | Iconos SVG (flecha) |
| `src/product.css` | Estilos del producto, solo tema claro |
| `public/brent/` | «El precio del Brent»: `index.html`, `scrollcraft.css`, `scrollcraft.js` y sus datos; los capítulos se marcan con `data-chapter` y de ahí salen el botón de índice, su panel y el raíl lateral |

## Convenciones

- **Skills**: antes de tocar la interfaz, carga las que apliquen si están instaladas: `scroll-craft`, `threejs-*` y `gsap-scrolltrigger` (estudio), `dataviz` (gráficos), `emil-skills:apple-design`, `threejs-*` y `laws-of-ux` (producto).
- **Tipografía (producto y estudio)**: Archivo para marca, títulos y cifras; Geist para texto. Nada de serif editoriales (Newsreader, Source Serif, Instrument Serif).
- **Página del Brent, color**: la paleta oscura del producto (fondo `#1c1c1f`, tinta `#f2f1ee`, botón principal en tinta, botones con 8 px de radio como en el producto); un solo acento, el violeta de la previsión (`--sc-accent`, `#b9a2ff`); `--sheen` para sucesos y datos de entrada; `--persist` para la persistencia. En los gráficos de celdas, RNN coral, LSTM `--sheen` y GRU violeta. Nada de beige, ámbar ni azul petróleo.
- **Producto, color**: el violeta `#6a4cf0` marca la previsión (franja y lo probable); la tinta, el precio real. «Cómo se hizo» va con el fondo oscuro del estudio para que se vea que es otro sitio.
- **Producto, movimiento**: muelles críticamente amortiguados que parten del valor en pantalla; iconos que se animan al pulsar; un solo momento de entrada; todo respeta `prefers-reduced-motion`.
- **Controles**: todo botón responde al pasar, al pulsar (`scale(0.97)`) y al foco de teclado; nunca `transition: all`.
- **Página del Brent, composición**: sin columnas de texto, recuadros decorativos ni notas pequeñas en gris.
- **Títulos**: sustantivos («La red», «El resultado»); nunca preguntas ni frases de acción.
- **Fórmulas**: con KaTeX; nunca como texto de código.
- **Enlaces**: siempre relativos; la web se sirve desde una subcarpeta.

## Cuidado con

- **Eje futuro**: los cuatro plazos van en huecos iguales (no es tiempo lineal); cada hueco lleva su etiqueta y el panel su fecha.
- **Ajustar a la ventana**: `.app` mide `100dvh` y el gráfico se redibuja con su tamaño real (`ResizeObserver`); no le pongas alturas mínimas en escritorio.
- **`public/brent/data.json` y `data2.json`**: ningún comando los regenera; si cambian los runs, quedan desfasados.
- **Librerías**: se cargan desde jsDelivr con versión fija (three 0.170.0, d3 7.9.0 y katex 0.16.11, solo en el estudio); no cambies una versión sin probar la página.
