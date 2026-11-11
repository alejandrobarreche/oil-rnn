# Caso de uso III

Transcripción de `ENUNCIADO.pdf` (4 páginas) para consulta. Ante cualquier duda manda el PDF.

## «Predicción del precio del petróleo (Brent y WTI) mediante Series Temporales y Redes Neuronales Recurrentes (RNN, LSTM y GRU)»

**Contexto:** El petróleo es la materia prima más negociada del mundo y su precio influye directamente en la inflación, los costes de transporte y energía, los márgenes empresariales y la política monetaria. Existen dos referencias internacionales: el Brent (Mar del Norte), que es la referencia para Europa y, por tanto, para España, y el WTI (*West Texas Intermediate*), referencia en Estados Unidos. Productores, aerolíneas, refinerías, *traders*, analistas y gestores de fondos buscan continuamente métodos para anticipar su evolución con el objetivo de cubrir riesgos, planificar compras y maximizar retornos. Las redes neuronales recurrentes (RNN) y sus variantes con memoria, LSTM (*Long Short-Term Memory*) y GRU (*Gated Recurrent Unit*), son conocidas por su capacidad para modelar patrones en series temporales, lo que las hace adecuadas para este problema, aunque el precio del crudo es especialmente volátil y sensible a eventos geopolíticos y a las decisiones de la OPEP+.

**Objetivo del Caso de Uso:** Desarrollar y comparar tres tipos de redes neuronales recurrentes (RNN simple, LSTM y GRU) para predecir el precio del petróleo Brent a corto, medio y largo plazo, e integrar el mejor modelo en una aplicación que calcule las predicciones, cuantifique su incertidumbre y las explique en lenguaje sencillo, como herramienta de apoyo a decisiones de inversión, cobertura y compra de energía.

## Requisitos Funcionales

1. **Recopilación de Datos:**
   - *Series Temporales:* Obtención de los precios históricos diarios del Brent (variable objetivo) y del WTI, en dólares por barril, desde el 1 de enero de 2000 hasta la fecha actual, desde fuentes oficiales y gratuitas (FRED / EIA).
   - *Datos Externos:* Incorporación de variables diarias de ámbito mundial que explican el precio del crudo: otras referencias (WTI, cesta OPEP), tipos de cambio (dólar/euro, yuan/dólar, índice del dólar), tipo de interés del BCE, gas natural, cobre y oro, y volatilidad de los mercados (VIX).

2. **Preprocesamiento de Datos:**
   - *Limpieza de Datos:* Manejo de valores faltantes (festivos distintos en cada mercado, días sin cotización) y *outliers*, como el precio negativo del WTI el 20 de abril de 2020, el máximo de 2008 o los picos de 2022 y 2026.
   - *Normalización:* Escalado de los datos para mejorar la convergencia del modelo durante el entrenamiento (ajustando el escalador solo con datos de entrenamiento).
   - *Creación de Secuencias:* Transformación de los datos en ventanas temporales (por ejemplo, 60 días) adecuadas para la entrada en una red recurrente.

3. **Desarrollo de los modelos de series temporales (RNN, LSTM y GRU):**
   - *Entrenamiento:* Los tres modelos se entrenarán con datos históricos del Brent, empleando validación cruzada temporal (*walk-forward*, sin mezclar fechas) y ajuste de hiperparámetros. Se compararán entre sí y con un modelo de referencia ingenuo («el precio futuro = el precio de hoy»).
   - *Predicción:* Se generarán predicciones a corto plazo (5 días hábiles, una semana), medio plazo (63 días hábiles, unos 3 meses) y largo plazo (252 días hábiles, unos 12 meses), cada una con su rango de incertidumbre.

4. **Evaluación del Desempeño:**
   - *Métricas:* Evaluación de cada modelo y de cada horizonte utilizando el error cuadrático medio (MSE), el error absoluto medio (MAE), la raíz del error cuadrático medio (RMSE) y, opcionalmente, el porcentaje de aciertos en la dirección del movimiento.

5. **Comparativa de los tres tipos de redes:**
   - *Condiciones iguales:* las tres redes (RNN simple, LSTM y GRU) se entrenarán con los mismos datos, la misma ventana de entrada, la misma partición entrenamiento/validación/test y un presupuesto similar de ajuste de hiperparámetros.
   - *Tabla comparativa:* para cada red y cada horizonte (corto, medio y largo plazo) se presentarán MAE, RMSE, la mejora respecto al modelo ingenuo, el número de parámetros y el tiempo de entrenamiento.
   - *Conclusión justificada:* se elegirá el modelo que se integra en la aplicación, explicando por qué (precisión, estabilidad, coste computacional) y en qué horizontes la predicción aporta valor frente al modelo ingenuo y en cuáles no.

6. **Aplicación: cálculo y explicación de los tres horizontes:**
   - *Interfaz de Usuario:* Desarrollo de una aplicación en Python (por ejemplo, con Streamlit) donde el usuario pueda elegir el horizonte (corto, medio o largo plazo) y visualizar el histórico, la predicción y las tendencias.
   - *Cálculo:* para cada horizonte la aplicación mostrará el precio previsto, la variación esperada respecto al último precio y un rango de incertidumbre (por ejemplo, un intervalo del 80 %).
   - *Explicación:* la aplicación generará un texto breve y comprensible para un usuario no técnico que explique qué significa la predicción, qué fiabilidad tiene en ese horizonte (según la comparativa) y qué factores pueden invalidarla.
   - *Ciclo económico:* la aplicación marcará en el gráfico histórico los principales picos y caídas del precio y explicará su relación con el ciclo económico mundial y con los acontecimientos que los provocaron. Como mínimo: el máximo de 2008 y el desplome posterior por la crisis financiera, la caída de 2014–2016 por exceso de oferta, el desplome de 2020 por la pandemia, la subida de 2022 tras la invasión de Ucrania y los movimientos más recientes de la serie.
   - *Actualización Dinámica:* la aplicación descargará los datos más recientes y permitirá reentrenar el modelo periódicamente para mantener su precisión.

## Fuentes de Datos

Todos los datos serán diarios (días hábiles) y de alcance mundial. El Brent es la referencia internacional del crudo (cerca de dos tercios del petróleo mundial se negocia con referencia a él) y se complementa con el WTI, la cesta de la OPEP y con indicadores diarios de los mercados mundiales: tipos de cambio, materias primas, tipos de interés y volatilidad.

La fuente general es el portal FRED (`https://fred.stlouisfed.org`), que publica gratis y sin clave los precios diarios del Brent y del WTI elaborados por la EIA, así como tipos de cambio, el tipo del BCE y la volatilidad de los mercados. Como fuente complementaria se usa Yahoo Finance, que aporta precios diarios de futuros con apertura, máximo, mínimo, cierre y volumen.

| Fuente | Dato diario | Serie / ticker | Desde |
|---|---|---|---|
| EIA (vía FRED) | Brent spot, $/barril — variable objetivo | `DCOILBRENTEU` | 1987 |
| EIA (vía FRED) | WTI spot, $/barril | `DCOILWTICO` | 1986 |
| EIA (vía FRED) | Gas natural Henry Hub | `DHHNGSP` | 1997 |
| BCE (vía FRED) | Tipo de la facilidad de depósito | `ECBDFR` | 1999 |
| Fed (vía FRED) | Tipos de cambio dólar/euro y yuan/dólar | `DEXUSEU`, `DEXCHUS` | 1999 / 1981 |
| Cboe (vía FRED) | Volatilidad de los mercados (VIX) | `VIXCLS` | 1990 |
| Yahoo Finance | Futuros del Brent (OHLC y volumen) | `BZ=F` | 2007 aprox. |
| Yahoo Finance | Futuros del WTI (OHLC y volumen) | `CL=F` | 2000 |
| Yahoo Finance | Cobre (indicador de actividad industrial mundial) | `HG=F` | 2000 |
| Yahoo Finance | Oro (activo refugio) | `GC=F` | 2000 |
| Yahoo Finance | Índice del dólar frente a las principales divisas | `DX-Y.NYB` | antes de 2000 |
| OPEP | Precio de la cesta de referencia (ORB) | Web de la OPEP | 2003 aprox. |

Enlaces:

- Yahoo Finance: `https://finance.yahoo.com`
- OPEP: `https://www.opec.org`
- EIA: `https://www.eia.gov/opendata/`

El código Python para descargar estos datos se proporciona en un fichero aparte (`descarga_datos_petroleo.py`).

> **Observaciones sobre los datos**
>
> - Periodo de estudio: desde el 1 de enero de 2000, con frecuencia diaria. El Brent de Yahoo Finance (`BZ=F`) solo tiene datos desde aproximadamente 2007; por eso la serie objetivo se toma de la EIA vía FRED, que tiene el Brent diario desde 1987, y Yahoo se usa como complemento.
> - Cada mercado tiene festivos distintos: las series se alinean con el calendario del Brent y los huecos se rellenan con el último valor disponible.
> - Las series spot de la EIA son precios de cierre (sin apertura, máximo, mínimo ni volumen) y se publican con unos días de retraso.
> - El WTI cotizó en negativo (−37,63 $) el 20/04/2020; por eso se recomienda el Brent como variable objetivo.

## Requisitos para la realización del trabajo

- Trabajo individual (1 persona).
- Se puede usar cualquier plataforma con Python.
- Se debe presentar un documento de máximo 5 diapositivas (sin incluir portadas), planteado como presentación para vender la aplicación a un público de alto valor (comité de dirección, inversores o responsables de compras de energía): problema y oportunidad, solución, comparativa de las tres redes, demostración de la aplicación con los tres horizontes y propuesta de valor. Si se presentan más de 5 hojas, el trabajo no será evaluado.
- No se entrega ningún fichero de código: todo el código se creará y se mantendrá en el repositorio de GitHub compartido (descarga de datos, comparativa de las tres redes y aplicación), con un `README` que explique cómo ejecutarlo.
- El repositorio debe contener una aplicación funcional que haga predicciones del precio del Brent a corto, medio y largo plazo.
- El trabajo debe contener una solución viable. No intensificar en la parte técnica.
- El plagio será sancionado con el suspenso automático de la tarea.
