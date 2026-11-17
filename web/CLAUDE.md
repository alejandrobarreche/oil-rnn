# web

Web del proyecto en dos partes: el producto (mesa de compras del Brent en una pantalla, Vite + TypeScript + ONNX Runtime Web + Three.js) y el estudio, «El precio del Brent» (desarrollo del trabajo con scroll, Three.js, D3 y KaTeX). Las reglas generales están en el `CLAUDE.md` de la raíz.

## Reglas clave

**Siempre**
- Usa los tokens que ya existen: los de `src/product.css` en el producto y las variables `--sc-*` de `public/brent/index.html` en el estudio.
- Mantén el producto en una pantalla sin scroll en escritorio: enseña por qué es útil y deja probarlo; las métricas van en una línea con enlace al estudio.
- Trabaja los dos temas, claro y oscuro, en cada cambio, y compruébalos en el navegador.
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
| `index.html`, `src/main.ts` | Producto: portada con el petrolero y, al empezar, la mesa de compras (barriles, plazo y decisión, con orden de compra); «Hoy» (ONNX) y «En el pasado» (días clave de test de `quality.json`) |
| `src/desk.ts` | Cálculos de la mesa sin DOM: días clave, eslora por barriles, diez futuros, regla de precios y resultado de la decisión |
| `src/ship.ts` | Petrolero 3D con geometría propia: cambia de eslora con la carga y se hunde al llenarse |
| `src/icons.ts` | Iconos SVG con sus partes animables |
| `src/product.css` | Estilos y temas claro y oscuro del producto |
| `src/sonda/bundle.js`, `src/sonda.ts` | Formato y días hábiles de la versión anterior; los usa el portal, no la mesa |
| `src/portal/`, `src/explain.ts` | Simulador y cálculos de la versión anterior; el producto no los usa |
| `public/brent/` | «El precio del Brent»: `index.html`, `scrollcraft.css`, `scrollcraft.js` y sus datos |

## Convenciones

- **Skills**: antes de tocar la interfaz, carga las que apliquen si están instaladas: `scroll-craft`, `threejs-*` y `gsap-scrolltrigger` (estudio), `dataviz` (gráficos), `emil-skills:apple-design`, `threejs-*` y `laws-of-ux` (producto).
- **Tipografía (producto y estudio)**: Archivo para marca, títulos y cifras; Geist para texto. Nada de serif editoriales (Newsreader, Source Serif, Instrument Serif).
- **Página del Brent, color**: un solo acento (`--sc-accent`); `--sheen` para sucesos y datos de entrada; `--persist` para la persistencia. Nada de beige.
- **Producto, color**: el violeta del brillo del crudo marca la previsión (`#6a4cf0` en claro, `#b9a2ff` en oscuro); verde y rojo solo para sube y baja. El tema sigue al sistema y se puede cambiar con el botón.
- **Producto, movimiento**: muelles críticamente amortiguados que parten del valor en pantalla; iconos que se animan al pulsar; un solo momento de entrada; todo respeta `prefers-reduced-motion`.
- **Controles**: todo botón responde al pasar, al pulsar (`scale(0.97)`) y al foco de teclado; nunca `transition: all`.
- **Página del Brent, composición**: sin columnas de texto, recuadros decorativos ni notas pequeñas en gris.
- **Títulos**: sustantivos («La red», «El resultado»); nunca preguntas ni frases de acción.
- **Fórmulas**: con KaTeX; nunca como texto de código.
- **Enlaces**: siempre relativos; la web se sirve desde una subcarpeta.

## Cuidado con

- **`src/sonda/bundle.js`**: lleva cambios propios; no lo sustituyas por el original del sistema de diseño.
- **«En el pasado»**: en `quality.json`, `t` es la fecha objetivo; el día de partida está `h` días hábiles antes. Solo hay días de test (2023–2026): antes, el modelo final ya vio los datos.
- **«Fijar el precio»**: en la realidad sería un futuro o una cobertura; la mesa lo simplifica con el precio spot.
- **`public/brent/data.json` y `data2.json`**: ningún comando los regenera; si cambian los runs, quedan desfasados.
- **Librerías**: se cargan desde jsDelivr con versión fija (three 0.170.0 en producto y estudio, d3 7.9.0, katex 0.16.11); no cambies una versión sin probar las dos páginas.
