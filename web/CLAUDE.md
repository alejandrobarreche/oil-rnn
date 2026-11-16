# web

Web del proyecto: Sonda (panel de previsión, Vite + TypeScript + ONNX Runtime Web) y «El precio del Brent» (página explicativa con scroll, Three.js, D3 y KaTeX). Las reglas generales están en el `CLAUDE.md` de la raíz.

## Reglas clave

**Siempre**
- Usa los tokens que ya existen: `src/sonda/tokens.css` en Sonda y las variables `--sc-*` de `public/brent/index.html` en la página del Brent.
- Haz que cada pantalla responda una pregunta con una cifra o un gráfico de datos reales; el texto solo nombra lo que se ve.
- Usa un objeto 3D solo si su forma o su movimiento enseñan el concepto (una ventana que avanza, un estado que pasa de un día al siguiente, un rango que se abre); si no, un gráfico 2D.
- Explica la red con sus datos reales: entradas, salida, error frente a la persistencia y curva de entrenamiento.
- Muestra cada cifra del modelo junto a su referencia trivial y di si es de validación o de test.
- Enseña el cambio visual al usuario en el navegador antes de darlo por bueno.

**Nunca**
- No añadas texto para explicar un gráfico que no se entiende: rehaz el gráfico.
- No pases de una idea y 25 palabras por paso de scroll, ni de una línea por subtítulo de tarjeta.
- No pongas explicaciones en `title`: en móvil no se ven. Escríbelas a la vista o quítalas.
- No repitas en un subtítulo lo que ya dice el título o la cabecera de la tabla; quítalo.
- No añadas escenas ni objetos 3D sin dato del proyecto detrás; usa un gráfico o elimina la escena.

## Comandos

```bash
make web-test      # Tests de web/ (los ejecuta Claude)
make web-dev       # Servidor de desarrollo (lo ejecuta el usuario)
make web-build     # Compilación a web/dist (lo ejecuta el usuario)
```

## Arquitectura

| Ruta | Qué contiene |
|---|---|
| `index.html` · `src/main.ts` | Sonda: página y composición del mercado |
| `src/portal/` | Cartera, calculadora e historial |
| `src/sonda/` | Copia del sistema de diseño Sonda: tokens, estilos y componentes |
| `src/style.css` | Estilos propios de la página |
| `src/explain.ts` | Cálculos de la interfaz: abanico, probabilidad de subida, factores |
| `public/brent/` | «El precio del Brent»: `index.html`, `scrollcraft.css`, `scrollcraft.js` y sus datos |

## Convenciones

- **Skills**: antes de tocar la interfaz, carga las que apliquen si están instaladas: `scroll-craft`, `threejs-*` y `gsap-scrolltrigger` (página del Brent), `dataviz` (gráficos), `laws-of-ux` y `emil-skills:emil-design-eng` (Sonda).
- **Página del Brent, tipografía**: Archivo para títulos y cifras, Geist para texto. Nada de serif editoriales (Newsreader, Source Serif, Instrument Serif).
- **Página del Brent, color**: un solo acento (`--sc-accent`); `--sheen` para sucesos y datos de entrada; `--persist` para la persistencia. Nada de beige.
- **Página del Brent, composición**: sin columnas de texto, recuadros decorativos ni notas pequeñas en gris.
- **Títulos**: sustantivos («La red», «El resultado»); nunca preguntas ni frases de acción.
- **Fórmulas**: con KaTeX; nunca como texto de código.
- **Enlaces**: siempre relativos; la web se sirve desde una subcarpeta.

## Cuidado con

- **`src/sonda/`**: es una copia del sistema de diseño; los estilos propios van en `src/style.css`.
- **`public/brent/data.json` y `data2.json`**: ningún comando los regenera; si cambian los runs, quedan desfasados.
- **Librerías de la página del Brent**: se cargan desde jsDelivr con versión fija (three 0.170.0, d3 7.9.0, katex 0.16.11); no cambies una versión sin probar la página entera.
