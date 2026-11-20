# Guion provisional de la página explicativa

Borrador de trabajo para la fase 6 del PLAN. Dirección visual: **A · Estratos (píxel)**. Bajar con el scroll es perforar; cada estrato es un capítulo y el yacimiento del fondo es Sonda.

**Cómo leer cada capítulo**

- **Texto**: el contenido que se cuenta, en borrador. Lo acompañan los assets; no hay títulos en forma de pregunta.
- **Escena**: lo que se ve en el corte de píxeles.
- **Scroll**: qué se mueve al bajar.
- **Esquema**: boceto de la composición, no a escala.
- **Datos**: de dónde sale cada cifra.

**Marcas**

- `†`: dato de cultura general que no está en el enunciado ni en `docs/references.bib`. Antes de publicarlo hace falta una fuente o hay que quitarlo.
- `[PENDIENTE]`: algo que el proyecto todavía no tiene.
- Las cifras del Brent salen de `data/raw/dataset.csv` (EIA vía FRED, spot diario en $/barril) y las métricas de `runs/` a través de `README.md` y `docs/DECISIONES.md`.

---

## 0 · Portada

**Texto**
> **oil-rnn**. Predicción del precio del Brent con redes recurrentes.
> Baja para perforar.

**Escena**: cielo en tres franjas, una torre de perforación en el centro y el suelo de hierba sin romper. El perfil de las montañas del fondo es el gráfico real del Brent de 2000 a 2026, con las cumbres de 2008, 2022 y 2026.

**Scroll**: el primer gesto rompe la hierba bajo la torre. Aparece el medidor de profundidad a la derecha y se queda fijo todo el recorrido.

```text
┌──────────────────────────────────────────────────────────────┐
│  ☁        ☁                                   ☁               │
│                     ▄█▄            ▄▄█              ▄█▄      │  ← perfil = Brent 2000–2026
│   ▁▂▃▄▅▆█▇▅▃▂▁▂▃▅▆▇█████▆▄▃▂▁▂▃▄▅▆▇███▇▅▃▂▁▃▅▇███▇▅▃▂     │
│                           ╱╲                                  │
│        oil-rnn           ╱██╲      ← torre                ┃▓┃ │ ← medidor
│  Predicción del Brent    ║██║                             ┃ ┃ │   (0 m)
│  con redes recurrentes   ║██║                             ┃ ┃ │
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ ← hierba
│                    ↓ baja para perforar                      │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: perfil de montañas = serie `brent` reescalada; las tres cumbres son el máximo de 2008, 2022 y 2026 (tabla del capítulo 2).

---

## 1 · Superficie (0 m) · El petróleo y el contexto del trabajo

**Texto**
> El petróleo crudo es una mezcla de hidrocarburos que se extrae del subsuelo y se refina para obtener combustibles como la gasolina, el gasóleo o el queroseno, además de materias primas para plásticos y productos químicos †.
>
> Es la materia prima más negociada del mundo. Su precio entra en la inflación, en el coste del transporte y la energía, en los márgenes de las empresas y en las decisiones de política monetaria. Por eso productores, aerolíneas, refinerías, *traders*, analistas y gestores de fondos intentan anticipar su evolución: para cubrir riesgos, planificar compras y buscar rentabilidad.
>
> El crudo no vale lo mismo en todas partes. Se negocia con referencias. Las dos principales son el **Brent**, del Mar del Norte, que es la referencia para Europa y, por tanto, para España, y el **WTI** (*West Texas Intermediate*), que es la referencia de Estados Unidos.
>
> Este trabajo predice el precio del Brent a cuatro plazos, **1 semana, 1 mes, 3 meses y 1 año**, con tres tipos de redes neuronales recurrentes. Para cada plazo da un precio central y un rango en el que debería caer 8 de cada 10 veces. Después comprueba si esas predicciones mejoran a la referencia más simple posible: suponer que el precio no cambia.

**Escena**: plano general en la superficie. En tierra, la torre de perforación; a la izquierda, un petrolero en el mar; a la derecha, iconos de píxel para los usos del crudo (surtidor, avión, fábrica, camión). Bajo ellos, una cinta con los cuatro plazos como cuatro marcas de profundidad.

**Scroll**: los iconos de usos se encienden uno a uno. Después la cámara baja y la cinta de plazos se convierte en las marcas del medidor lateral.

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 01 · SUPERFICIE                                     │
│                                                              │
│  ~~~~~~~~~~~ ▄▄▄▄█▄              ╱╲        ⛽  ✈  🏭  🚚      │  (iconos en píxel,
│  ~~ mar ~~~~ petrolero          ╱██╲       usos del crudo     │   no emoji)
│  ~~~~~~~~~~~~~~~~~~~~           ║██║                          │
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│                                                              │
│  ┌──────── objetivo ─────────────────────────────────────┐   │
│  │ 1 semana │ 1 mes │ 3 meses │ 1 año                     │   │
│  │  5 días  │ 21    │ 63      │ 252 días hábiles          │   │
│  │ precio central + rango del 80 %  vs  «precio de hoy»  │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: contexto, usuarios del pronóstico, Brent/WTI y objetivo en `docs/assignment/ENUNCIADO.md`. Definición de crudo y lista de derivados †.

---

## 2 · Arenas (−300 m) · El Brent y sus sucesos

**Texto**
> El Brent es un crudo ligero del Mar del Norte. Funciona como precio de referencia: cerca de dos tercios del petróleo mundial se negocia tomándolo como base. La serie que usamos es el precio *spot* diario, es decir, el precio de entrega inmediata, que publica la EIA (la agencia de información energética de Estados Unidos) en dólares por barril. Se publica con unos días de retraso.
>
> En 26 años ha pasado de unos 21 $ a casi 144 $, ha caído por debajo de 10 $ y ha vuelto a subir por encima de 130 $. Cada gran movimiento tiene detrás un suceso del ciclo económico o de la geopolítica:
>
> - **2008, máximo histórico (143,95 $, 3 de julio)**: final de la expansión previa a la crisis financiera.
> - **2008, desplome (33,73 $, 26 de diciembre)**: la crisis financiera lleva a la economía mundial a una recesión.
> - **2014–2016, exceso de oferta (26,01 $, 20 de enero de 2016)**: se produce más crudo del que se consume.
> - **2020, pandemia (9,12 $, 21 de abril)**: la actividad y la demanda se paran. Un día antes el WTI llegó a cotizar en negativo, a −37,63 $.
> - **2022, invasión de Ucrania (133,18 $, 8 de marzo)**.
> - **2026, subida reciente (138,21 $, 7 de abril)**: es el movimiento más reciente de la serie. Su causa no se documenta en este proyecto `[PENDIENTE: escribir la causa]`.
>
> Estos saltos son el motivo por el que predecir el Brent es difícil: los provocan sucesos que no están en los datos del día anterior.

**Escena**: es la escena del lienzo A. La línea del horizonte es el gráfico histórico; bajo cada montaña o valle, en el estrato de arena, aparece enterrado el objeto del suceso como un fósil: un gráfico de bolsa roto (2008), barriles apilados (2014–2016), una mascarilla (2020), un oleoducto (2022) y un signo de interrogación (2026). Cada fósil lleva su cartel con año, nombre y precio.

**Scroll**: sección anclada. Al bajar, el paisaje se desplaza en horizontal de 2000 a 2026 y un contador de año acompaña al de profundidad. Al pasar por cada suceso, su fósil se recuadra en ámbar y el cuadro de diálogo inferior cuenta su texto.

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 02 · ARENAS                       año 2008 │ −300 m │
│                 ▄█▄ 143,95 $                                 │
│     ▁▂▃▅▆▇█▇▅▃▂█████                ▅▇█ 133,18 $  ▆█ 138,21 $ │  ← horizonte = Brent
│ ▁▂▃            ▀▀▀▀▂▁ ▂▃▄▅▆▅▄▂▁ ▁▂▃ ▀▀▀▄▃▂▁▂▃▄▅▀▀▀▀▄▃▂        │
│                   ▀33,73   ▀26,01   ▀9,12                    │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░ ┏━━━━┓ ░░░░░ [▤▤] ░░░░░░ [◠] ░░░░░ [═╦═] ░░░ [?] ░░░░░░░░░│ ← fósiles
│░░ ┃📉 ┃ 2008  2015  barriles  2020   2022 oleoducto  2026  ░░│   en arena
│░░ ┗━━━━┛ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ ┌────────────────────────────────────────────────────────┐   │
│ │ 2008. Máximo de toda la serie: 143,95 $ el 3 de julio, │   │ ← diálogo
│ │ al final de la expansión previa a la crisis.        ▼  │   │
│ └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: definición de Brent, «dos tercios», retraso de la EIA, WTI negativo y causas de los sucesos en `ENUNCIADO.md` y en `web.events` de `configs/config.yaml`. Fechas y precios calculados sobre `data/raw/dataset.csv` (primer dato 2000, mínimo 21,05 $ el 11/04/2000). «Crudo ligero» †. Sucesos anteriores a 2000 (1973, 1979) †: fuera de la serie; propongo no incluirlos.

---

## 3 · Arcillas (−900 m) · Los datos que mueven el precio

**Texto**
> Para predecir el Brent, la red no mira solo el Brent. Lee **15 series diarias** de los mercados mundiales que el enunciado relaciona con el crudo:
>
> | Grupo | Series | Qué aporta |
> |---|---|---|
> | Otras referencias del crudo | Brent y WTI (*spot*), y futuro del WTI con apertura, máximo, mínimo, cierre y volumen | El propio mercado del petróleo |
> | Energía | Gas natural Henry Hub | Un sustituto energético |
> | Divisas | Dólar/euro, yuan/dólar e índice del dólar | El crudo se paga en dólares |
> | Tipos de interés | Facilidad de depósito del BCE | El coste del dinero |
> | Materias primas | Cobre y oro | Actividad industrial y activo refugio |
> | Riesgo | VIX | El miedo en los mercados |
>
> Además se añade la volatilidad del último mes del Brent, que mide cuánto se ha movido el precio últimamente.
>
> Antes de entrar en la red, los datos se preparan en cuatro pasos:
> 1. **Alinear**: cada mercado tiene festivos distintos. Todo se alinea con los días en los que hay precio del Brent, y un hueco se rellena con el último valor conocido. En total se rellenan 12 709 huecos.
> 2. **Cambios en vez de niveles**: la red recibe el cambio porcentual diario (rendimiento logarítmico), no el precio. Un precio de 100 $ en 2008 y en 2022 no significa lo mismo, pero una subida del 2 % sí.
> 3. **Valores extremos**: al WTI se le pone un suelo de 1 $ por el día en que cotizó en negativo, y cualquier valor que se aleje más de 5 desviaciones típicas se recorta.
> 4. **Escalar**: cada serie se estandariza (media 0, desviación 1) con medias y desviaciones calculadas **solo con los datos de entrenamiento**, para que el modelo no vea nada del futuro.
>
> Dos datos del enunciado no entran: la cesta de la OPEP, que no está, y el futuro del Brent, que solo tiene datos desde 2007.

**Escena**: en el estrato de arcilla, vetas de colores entran desde los bordes y convergen en una bolsa central. Cada veta es un grupo de la tabla con su icono de píxel (gota, llama, billete, banco, lingote, rayo). Debajo de la bolsa, una cinta transportadora con cuatro estaciones: alinear, cambios, recortar, escalar.

**Scroll**: las vetas se dibujan de fuera hacia dentro, una por grupo, y al llegar cada una se enciende su fila de la tabla. Luego un bloque de roca recorre la cinta y sale de cada estación transformado; en la última se ilumina el cartel «solo con train».

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 03 · ARCILLAS                                       │
│▓▓ crudo ═══════╗                          ╔═══════ divisas ▓▓│
│▓▓ (Brent, WTI, ╚════╗                ╔════╝  (USD/EUR,     ▓▓│
│▓▓  futuro WTI)      ╚═══╗  ┌──────┐ ╔╝        CNY, DXY)    ▓▓│
│▓▓ gas ═════════════════ ╠══│ 15 + │═╣ ══════════ BCE      ▓▓│
│▓▓                   ╔═══╝  │ vol. │ ╚═══╗                  ▓▓│
│▓▓ cobre, oro ═══════╝      └──┬───┘     ╚════════ VIX      ▓▓│
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  ▣ → [alinear] → [cambios %] → [recortar ±5σ] → [escalar] → ▢│
│        ffill     log x[t]/x[t−1]   suelo WTI 1 $   solo train│
└──────────────────────────────────────────────────────────────┘
```

**Datos**: series en `configs/config.yaml` (`data.source`, `data.features`, `data.inputs`); huecos en `data/splits.json` (`missing_before_fill`); exclusiones en `docs/DECISIONES.md` (Mejoras pendientes). Descripción de cada grupo («activo refugio», «actividad industrial») en `ENUNCIADO.md`.

---

## 4 · Calizas (−1.500 m) · Las soluciones posibles y cómo se comparan

**Texto**
> Cualquier modelo tiene que ganar a una referencia trivial. Si no lo hace, no aporta nada. Se compararon estas soluciones, de la más simple a la más compleja:
>
> 1. **Persistencia**: «el precio dentro de h días será el de hoy». Es la referencia del error.
> 2. **Cuantiles históricos**: el rango se toma de cómo se movió el Brent a ese plazo en el pasado. Es la referencia del intervalo.
> 3. **Ingenuo con futuros**: el último precio publicado se actualiza con lo que se ha movido el futuro del Brent desde entonces. No es una red; corrige el retraso de publicación.
> 4. **RNN simple**: una red que lee la secuencia día a día y guarda un resumen de lo visto (su estado oculto).
> 5. **LSTM**: añade puertas que deciden qué recordar y qué olvidar, para conservar información durante más tiempo.
> 6. **GRU**: una versión simplificada de la LSTM, con menos parámetros.
>
> Las tres redes tuvieron las mismas condiciones: mismos datos, misma ventana, mismos pliegues y la misma rejilla de **36 configuraciones** (tamaño de 32 a 256 neuronas, 1 o 2 capas, *dropout* 0 o 0,3, tasa de aprendizaje de 0,0001 a 0,001). Son 3 redes × 4 plazos × 36 configuraciones = **432 entrenamientos**, cada uno evaluado en 4 pliegues. Las finalistas se repitieron con 3 semillas.
>
> **Cómo se puntúa**. La validación es *walk-forward*: cada pliegue entrena con todo el pasado y se examina en los 2 años siguientes, como si se usara de verdad en ese momento. Entre entrenamiento y examen se dejan h días sin usar, para que ningún dato de entrenamiento mire al futuro. Los años 2023–2026 (test) no se tocan hasta el final.
>
> En validación, el resultado era prometedor a 3 meses: la GRU mejoraba a la persistencia un 4,8 % en RMSE. A 1 semana y 1 mes las tres redes quedaban empatadas con la persistencia y a 1 año, por detrás. El ingenuo con futuros mejoraba a la persistencia a 1 semana un 8,5 % con un solo día de futuros: más que cualquier red.

**Escena**: «carrera de sondas» del lienzo A. Seis túneles verticales en la caliza, uno por solución, con su nombre arriba. Las tres referencias en gris; las tres redes en color. Abajo, cuatro pestañas de plazo (1 sem · 1 mes · 3 m · 1 año).

**Scroll**: las seis sondas bajan a la vez al ritmo del scroll y se paran en su resultado de validación: la profundidad es la mejora frente a la persistencia, y la línea de la persistencia marca el 0. Debajo, una tira de cuatro bloques muestra el *walk-forward*: el tramo de entrenamiento crece, el bloque de examen avanza y entre ambos hay un hueco.

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 04 · CALIZAS          [1 sem] [1 mes] [3 m]* [1 año]│
│ Persist. Cuantiles Futuros   RNN    LSTM    GRU              │
│   ║        ║         ║        ║      ║       ║               │
│ ──╨────────╨─────────║────────║──────║───────║── 0 % ──────  │ ← persistencia
│                      ║        ▼      ▼       ║               │
│                      ▼      +1,4%  +0,1%     ║               │
│                   (1 sem)                    ▼ +4,8 %        │ ← mejora RMSE
│                   +8,5 %                                     │   en validación
│──────────────────────────────────────────────────────────────│
│ walk-forward                                                 │
│ pliegue 1 ████████████░[▒▒ 2 años ▒▒]                         │
│ pliegue 2 ████████████████░[▒▒ 2 años ▒▒]                     │
│ pliegue 3 ████████████████████░[▒▒ 2 años ▒▒]                 │
│ pliegue 4 ████████████████████████░[▒▒ 2 años ▒▒]   │ test    │
│           entrenar      ░ = hueco de h días         2023–26  │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: rejilla y criterio en `README.md` (Selección de modelos) y `configs/config.yaml` (`sweep`, `cv`); tabla de validación con media ± desviación en 3 semillas en `README.md`; ingenuo con futuros en `README.md` (Conclusión por horizonte). En el esquema, las mejoras de 3 meses son de la tabla del README; el +8,5 % es a 1 semana.

---

## 5 · Pizarras (−2.100 m) · La solución elegida y cómo funciona

**Texto**
> No hay un solo modelo: hay **uno por plazo**, y en cada uno gana una red distinta. Se eligió la que tenía menor error medio en validación, medido con la pérdida *pinball* (la que se usa para entrenar rangos), en 3 semillas:
>
> | Plazo | Red elegida | Configuración |
> |---|---|---|
> | 1 semana (5 días) | GRU | 256 neuronas, 1 capa |
> | 1 mes (21 días) | LSTM | 64 neuronas, 1 capa |
> | 3 meses (63 días) | GRU | 128 neuronas, 2 capas, *dropout* 0,3 |
> | 1 año (252 días) | RNN simple | 256 neuronas, 2 capas, *dropout* 0,3 |
>
> **Qué hace cada modelo**. Lee los últimos **60 días** de las 15 series y devuelve tres números: el cambio del precio que deja un 10 % de probabilidad por debajo, la mediana y el cambio que deja un 10 % por encima. Entre el primero y el último queda el **intervalo del 80 %**. El cambio se convierte después en precio a partir del último Brent publicado.
>
> **Qué no promete**. No predice sucesos. Su rango se ajustó con los años de validación y, en 2026, con el precio subiendo, cubrió entre el 48 y el 58 % de los casos en vez del 80 %.

**Escena**: las otras sondas se apagan y quedan como túneles grises. Siguen bajando cuatro, una por plazo, cada una con el color y el nombre de su red. La cámara se acerca a la de 3 meses. Junto al cabezal, una tira de 60 bloques (los 60 días) entra por arriba y por abajo salen tres gotas: P10, mediana y P90.

**Scroll**: las tres sondas descartadas de cada plazo se oscurecen una a una. Zoom continuo al cabezal; la ventana de 60 días se desliza un bloque y las tres gotas se recolocan.

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 05 · PIZARRAS                                       │
│   1 semana     1 mes       3 meses       1 año               │
│   ║ GRU        ║ LSTM      ║ GRU         ║ RNN               │
│   ║            ║           ║             ║                   │
│   ▼            ▼           ║             ▼                   │
│                            ║                                 │
│    ┌─ 60 días × 15 series ─╨──────────┐                      │
│    │ ▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦▦│                      │
│    └───────────────┬──────────────────┘                      │
│                 ┌──┴──┐   cabezal = red                      │
│                 │ GRU │                                      │
│                 └──┬──┘                                      │
│             ●      ●      ●                                  │
│            P10  mediana  P90   ←── intervalo del 80 % ──→    │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: redes y configuración en `README.md` (Evaluación en test) y `configs/config.yaml` (`web.models`); ventana y cuantiles en `configs/config.yaml` (`data.window`, `model.quantiles`); cobertura de 2026 en `README.md` (Conclusión por horizonte).

---

## 6 · Basalto (−2.600 m) · La arquitectura de la red y cómo se entrena

**Texto**
> **Por dentro**. Tomamos como ejemplo la GRU de 3 meses. Cada día de la ventana entra como un vector de 16 números (15 series y la volatilidad). Dos capas recurrentes de 128 neuronas lo leen en orden, del día más antiguo al más reciente. En cada paso, la celda mezcla el día nuevo con lo que recordaba, a través de dos puertas: la de **actualización**, que decide cuánto del recuerdo se sustituye, y la de **reinicio**, que decide cuánto del pasado se usa para calcular el candidato nuevo. Del último paso sale el estado final, y una capa lineal lo convierte en los tres cuantiles. En total son 155 523 parámetros.
>
> **Cómo aprende**. El objetivo es el cambio logarítmico del precio a h días. La pérdida *pinball* castiga de forma asimétrica: si el precio real queda por encima del cuantil 90 se paga mucho y, si queda por debajo, poco. Así cada salida aprende su propio cuantil. El optimizador ajusta los pesos en lotes de ejemplos durante un máximo de 60 épocas. El último año de cada tramo de entrenamiento se reserva para decidir cuándo parar (*early stopping*): si el error en ese año no mejora en 10 épocas, se detiene y se quedan los mejores pesos.
>
> **Ajustar el rango**. Al terminar, el ancho del intervalo se corrige con los datos de validación para que cubra el 80 % de los casos `[PENDIENTE: referencia de la calibración conforme]`.
>
> **Modelo final**. Con la configuración ya elegida, cada red se reentrenó una vez con entrenamiento y validación juntos (2000–2023) y se evaluó una sola vez en test. Cada entrenamiento duró entre 10 y 29 segundos en una GPU de portátil (RTX 3050 Ti).
>
> **Lo que se vio al entrenar**. La red deja de mejorar en la época 1 o 2: aprende poco de estos datos.

**Escena**: corte del cabezal, «dentro de la máquina» del lienzo A. Arriba entra roca triturada (los 60 días); dos filas de bloques son las dos capas recurrentes, con una flecha que vuelve a la propia fila (la recurrencia) y dos compuertas dibujadas como válvulas (actualización y reinicio). Abajo, una fila de 3 bloques (los cuantiles) deja caer tres gotas.

**Scroll**: vista explotada: las piezas se separan y se rotulan una a una (entrada → capa 1 → capa 2 → lineal → cuantiles). Después, una mini curva de pérdida en píxeles se dibuja época a época y se para pronto, con el cartel «early stopping».

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 06 · BASALTO                                        │
│            ░░▒▒ 60 días × 16 valores ▒▒░░                    │
│                       │                                      │
│   ┌───────────────────▼───────────────────┐                  │
│   │ capa GRU 1 · 128  ▣▣▣▣▣▣▣▣ ⟲ h(t−1)   │  ⊕ actualización │
│   ├───────────────────┬───────────────────┤  ⊗ reinicio      │
│   │ capa GRU 2 · 128  ▣▣▣▣▣▣▣▣ ⟲ dropout  │                  │
│   └───────────────────┬───────────────────┘                  │
│                 ┌─────▼─────┐                                │
│                 │  lineal   │                                │
│                 └─┬───┬───┬─┘          pérdida               │
│                   ●   ●   ●            █▄▂▁▁▁▁ ← para pronto │
│                  P10 P50 P90             época               │
│ entrenar 2000–2023 ─────────▶ test 2023–2026 (una sola vez)  │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: configuración y parámetros en `README.md` (Evaluación en test); 16 entradas = 15 series de `data.features` + `data.inputs.volatility`; épocas, paciencia y reserva en `configs/config.yaml` (`train`, `cv.holdout`); «época 1 o 2» y ajuste del intervalo en `docs/DECISIONES.md`. Mecanismo de las puertas GRU: descripción estándar de la celda; si se cita un artículo, hace falta su entrada en `docs/references.bib` †.

---

## 7 · Yacimiento (−3.000 m) · Sonda y su actualización

**Texto**
> Este es el resultado: **Sonda**. Muestra el histórico del Brent con sus sucesos marcados y, para cada plazo, el precio previsto, la variación frente al último precio, el intervalo del 80 % y un texto en lenguaje sencillo que explica qué significa la predicción y cuánto fiarse de ella.
>
> Los cuatro modelos se ejecutan **en el navegador**, sin servidor: se exportan a ONNX, un formato estándar de redes, y los ejecuta ONNX Runtime Web. El preprocesado del capítulo 3 está replicado en TypeScript, y se comprueba que la predicción del navegador coincide con la de Python.
>
> Sonda incluye un **portal de inversión con dinero ficticio**: el usuario puede abrir posiciones, consultar su cartera, probar la calculadora, ver su historial y preguntar «¿y si hubiera seguido al modelo?».
>
> **Cada día** `[PENDIENTE: fase 7]`: un proceso automático descargará los datos nuevos, recalculará la predicción y la publicará. El modelo se reentrenará a mano o cada cierto tiempo. Hoy los datos llegan hasta el 3 de noviembre de 2026 (107,03 $).

**Escena**: la sonda llega a una bolsa de crudo que brilla en el azul de Sonda. El crudo se convierte en el gráfico de Sonda pixelado: línea de precio sólida, previsión discontinua y abanico del intervalo. A un lado, el ciclo diario en tres bloques: descargar → predecir → publicar.

**Scroll**: al terminar de bajar, el gráfico pixelado se «despixela» y se convierte en la interfaz real de Sonda, con un botón para abrirla. El ciclo diario solo gira cuando la fase 7 exista; hasta entonces se muestra apagado con el rótulo «próximamente» o no se muestra.

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 07 · YACIMIENTO                          −3.000 m   │
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  ┌──────────────────────▼──────────────────────┐  ┌───────┐  │
│  │ $                              ░░░░░░▒▒▒    │  │descar-│  │
│  │ 130 ▁▂▅▇▆▅▃▂         ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒     │  │ gar   │  │
│  │ 107        ▃▄▅▄▃▂▃▄▅▆━ ─ ─ ─ ─ ─ ─ ─       │  │  ↓    │  │
│  │                      ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒     │  │predecir│ │
│  │  real (sólida) · previsión · intervalo 80 % │  │  ↓    │  │
│  └─────────────────────────────────────────────┘  │publicar│ │
│        [ Abrir Sonda ]   [ Portal de inversión ]  └PENDIENTE┘│
└──────────────────────────────────────────────────────────────┘
```

**Datos**: funciones de Sonda y portal en `web/src/` (`sonda.ts`, `explain.ts`, `portal/`); ONNX y comprobación Python ↔ navegador en `docs/PLAN.md` y `README.md`; último dato en `data/raw/dataset.csv`; actualización diaria `[PENDIENTE]` en `docs/PLAN.md` (fase 7).

---

## 8 · Vuelta a la superficie · Conclusiones y mejoras

**Texto**
> **Lo que dice el test (2023–2026, 955 días)**. Ninguna red mejora a la persistencia en ningún plazo:
>
> | Plazo | Red | Error (RMSE) red / persistencia | Mejora | Cobertura del 80 % (red / histórica) | p |
> |---|---|---|---|---|---|
> | 1 semana | GRU | 5,55 / 5,36 $ | −3,6 % | 78 % / 79 % | 0,22 |
> | 1 mes | LSTM | 11,56 / 10,69 $ | −8,1 % | 86 % / 84 % | 0,46 |
> | 3 meses | GRU | 28,24 / 17,54 $ | −61 % | 68 % / 86 % | 0,27 |
> | 1 año | RNN | 33,03 / 22,71 $ | −45 % | 92 % / 92 % | 0,40 |
>
> Ninguna diferencia es significativa al 5 % (contraste de Diebold-Mariano). La red no mejora a «el precio de hoy», pero tampoco se puede afirmar que sea peor: a 3 meses y a 1 año solo hay unos 15 y 3 pronósticos independientes, demasiado pocos para distinguirlos.
>
> **Lo que sí se aprende**
> - A 3 meses la red acierta la dirección del cambio el 60 % de los días, pero exagera la magnitud: predice de media una subida del 11 % cuando la real fue del 1,7 %.
> - El dato más fiable es el intervalo a 1 semana: cubre el 78 % de los casos, tan bien como los cuantiles históricos.
> - Buena parte de la dificultad a 1 semana es el retraso de publicación del precio, no la red: corregirlo con el futuro del Brent gana a la persistencia en validación.
> - La mejora de validación a 3 meses venía casi entera de un solo pliegue (2021–2023): elegir entre muchas configuraciones encuentra la que tuvo suerte.
>
> **Mejoras posibles**, de menor a mayor coste:
> 1. Probar solo el Brent como entrada, para saber si las 14 series externas aportan algo.
> 2. Entrenar con una ventana deslizante, para olvidar regímenes antiguos.
> 3. Añadir un indicador de «dato que falta» en vez de repetir el último valor.
> 4. Añadir la cesta de la OPEP.
> 5. Usar el futuro del Brent como entrada y modelar el retraso real de publicación.
> 6. Evaluar test con varias semillas.
> 7. Completar la actualización diaria `[PENDIENTE]`.

**Escena**: el crudo sube por la tubería y la cámara se aleja hasta ver el corte entero, de la superficie al yacimiento. En la superficie, cada mejora es un pozo nuevo marcado con una bandera numerada. La tabla de test aparece como un cartel de madera junto a la torre.

**Scroll**: zoom out final. Las banderas de mejora se clavan una a una. Al final, enlaces a Sonda, al repositorio y a las decisiones.

```text
┌──────────────────────────────────────────────────────────────┐
│ CAPÍTULO 08 · VUELTA A LA SUPERFICIE                         │
│   ⚑1   ⚑2      ╱╲       ⚑3   ⚑4   ⚑5      ┌ test 2023–26 ──┐ │
│   ║    ║      ╱██╲      ║    ║    ║       │ 1 sem  −3,6 %  │ │
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒║██║▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ 1 mes  −8,1 %  │▒│
│░░ arenas ░░░░░║ ↑║░░░░░░░░░░░░░░░░░░░░░░░│ 3 m   −61 %   │░│
│▓▓ arcillas ▓▓▓║ ↑║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 1 año −45 %   │▓│
│██ calizas ████║ ↑║███████████████████████│ p > 0,05 todos│█│
│▚▚ pizarras ▚▚▚║ ↑║▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚└────────────────┘▚│
│▞▞ basalto ▞▞▞▞║ ↑║▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞│
│ ≋≋≋≋≋≋≋≋≋≋≋≋≋≋ yacimiento · Sonda ≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋ │
│      [ Abrir Sonda ]   [ Repositorio ]   [ Decisiones ]      │
└──────────────────────────────────────────────────────────────┘
```

**Datos**: tabla de test, Diebold-Mariano y conclusiones en `README.md` (Evaluación en test, Contraste de Diebold-Mariano, Conclusión por horizonte); mejoras en `docs/DECISIONES.md` (Mejoras pendientes). Cita: Diebold y Mariano (1995) y Harvey, Leybourne y Newbold (1997), en `docs/references.bib`.

---

## Pendiente de decidir

- [ ] Datos `†`: buscar fuente o quitarlos (definición de crudo y derivados, «crudo ligero», mecanismo GRU si se cita).
- [ ] Causa de la subida de 2026 (capítulo 2).
- [ ] Referencia de la calibración conforme (capítulo 6).
- [ ] Capítulo 7: mostrar el ciclo diario apagado o no mostrarlo hasta que exista la fase 7.
- [ ] Ejemplo de red del capítulo 6: GRU de 3 meses (la del gráfico de test del README) u otra.
