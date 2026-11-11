<div align="center">

# oil-rnn

**Predicción del precio del Brent con redes recurrentes, ejecutada en el navegador.**

[![Abrir la aplicación](https://img.shields.io/badge/Abrir_la_aplicación-1f6feb?style=for-the-badge&logo=googlechrome&logoColor=white)](https://alejandrobarreche.github.io/oil-rnn/)
[![Guía de uso](https://img.shields.io/badge/Guía_de_uso-2da44e?style=for-the-badge&logo=readthedocs&logoColor=white)](docs/USAGE.md)
[![Bibliografía](https://img.shields.io/badge/Bibliografía-b08800?style=for-the-badge&logo=zotero&logoColor=white)](docs/references.bib)

[![CI](https://github.com/alejandrobarreche/oil-rnn/actions/workflows/ci.yml/badge.svg)](https://github.com/alejandrobarreche/oil-rnn/actions/workflows/ci.yml)

</div>

---

## Contenido

1. [Qué hace](#qué-hace)
2. [Cómo funciona](#cómo-funciona)
3. [Decisiones de diseño](#decisiones-de-diseño)
4. [Resultados](#resultados)
5. [Inicio rápido](#inicio-rápido)
6. [Tecnologías](#tecnologías)
7. [Estructura](#estructura)
8. [Estado del proyecto](#estado-del-proyecto)

---

## Qué hace

Entrena una RNN simple, una LSTM y una GRU con la serie diaria del Brent (desde 2000) y variables de mercado. Cada modelo se compara con la referencia trivial de persistencia: «el precio futuro es el de hoy». El mejor modelo se exporta a ONNX y la página web lo ejecuta en el navegador, sin servidor y sin enviar datos.

Se predicen tres horizontes a partir del último precio conocido:

```mermaid
flowchart LR
    P([Último precio]) --> C[Corto plazo<br/>5 días hábiles<br/>≈ 1 semana]
    P --> M[Medio plazo<br/>63 días hábiles<br/>≈ 3 meses]
    P --> L[Largo plazo<br/>252 días hábiles<br/>≈ 12 meses]
```

---

## Cómo funciona

**Figura 1. Del dato a la web**

```mermaid
flowchart LR
    A[FRED · Yahoo Finance] -->|make data| B[(data/raw)]
    B -->|make prepare| C[train → val → test<br/>tramos cronológicos]
    C -->|make train| D{RNN · LSTM · GRU}
    D --> E[runs · models · artifacts<br/>MLflow]
    E -->|make evaluate| F[métricas frente<br/>a persistencia]
    E -->|make export-web| G[model.onnx]
    G --> H[Web en el navegador<br/>GitHub Pages]
```

**Figura 2. División cronológica de los datos**

```mermaid
flowchart LR
    T["train<br/>ajusta el modelo y el preprocesado"] --> V["val<br/>decide arquitectura e hiperparámetros"] --> S["test<br/>solo la evaluación final"]
```

---

## Decisiones de diseño

- **Splits cronológicos, sin mezclar fechas.** El modelo nunca entrena con datos posteriores a los que predice.
- **Preprocesado ajustado solo con train.** La media y la escala de val y test no influyen en el entrenamiento.
- **`test` solo en la evaluación final.** Ninguna decisión se toma mirando test.
- **Cada métrica junto a su referencia de persistencia.** Un modelo que no mejora «el último valor conocido» no aporta nada.
- **Un run por entrenamiento, con id propio.** Fecha, nombre y ordenador identifican la configuración, el commit, el hash de los datos y los pesos.
- **Inferencia en el navegador.** La web es estática: no hay servidor que mantener y los datos no salen del equipo.

---

## Resultados

> [!NOTE]
> Aún no hay runs definitivos. Esta sección se rellenará solo con métricas medidas sobre `test`, para cada red y cada horizonte: MAE, RMSE, mejora frente a persistencia, número de parámetros y tiempo de entrenamiento.

- **RNN:** pendiente
- **LSTM:** pendiente
- **GRU:** pendiente

---

## Inicio rápido

```bash
make setup
conda activate oil-rnn
make data
make prepare
make train NAME=baseline
make web-dev
```

`make prepare` se detiene si `configs/config.yaml` tiene valores `PENDIENTE`; `make pending` los lista. Todos los comandos, agrupados por fase y por tarea, están en la [guía de uso](docs/USAGE.md). `make help` los resume en la terminal.

---

## Tecnologías

<div align="center">

![Python](https://img.shields.io/badge/Python_3.12-3776ab?style=for-the-badge&logo=python&logoColor=white)
![PyTorch](https://img.shields.io/badge/PyTorch-ee4c2c?style=for-the-badge&logo=pytorch&logoColor=white)
![MLflow](https://img.shields.io/badge/MLflow-0194e2?style=for-the-badge&logo=mlflow&logoColor=white)
![ONNX](https://img.shields.io/badge/ONNX_Runtime_Web-005ced?style=for-the-badge&logo=onnx&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?style=for-the-badge&logo=vite&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=for-the-badge&logo=githubpages&logoColor=white)

</div>

---

## Estructura

<details>
<summary>Carpetas principales</summary>

```text
oil-rnn/
├── configs/config.yaml     configuración; cada run guarda su copia
├── data/                   no se versiona: raw/, train/, val/, test/, splits.json
├── runs/<run_id>/          config, meta, métricas y log del run
├── artifacts/<run_id>/     gráficas y predicciones
├── models/<run_id>/        pesos y preprocesado (no se versiona)
├── notebooks/              exploración con train
├── src/oil_rnn/            datos, features, modelo, métricas, runs, exportación
├── web/                    aplicación web (Vite + TypeScript)
├── docs/                   USAGE.md · enunciado · bibliografía · presentación
├── tests/
└── Makefile
```

</details>

---

## Estado del proyecto

- [x] Estructura inicial y descarga de datos
- [ ] Decisiones de `config.yaml` (target, variables, ventana, horizonte, splits)
- [ ] Entrenamiento y comparación de RNN, LSTM y GRU
- [ ] Modelo exportado y web publicada

---

## Bibliografía

`docs/references.bib` es la única fuente de citas y se mantiene con Zotero (Better BibTeX).
