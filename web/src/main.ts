// Sonda · predicción del Brent. Composición Workspace del sistema de diseño Sonda 2
// (src/sonda/: bundle.js, bundle.css y tokens.css, copiados del artefacto del sistema de diseño):
// sus componentes (window.Sonda.ui), su gráfico interactivo (charts.price) y su backtest, alimentados
// con los datos de make export-web y las predicciones ONNX calculadas en el navegador.
// Versión WebAssembly (CPU): el .wasm se empaqueta con la web, sin depender de un CDN.
import * as ort from "onnxruntime-web/wasm";
import { mountDrop } from "./drop";
import { occlusion } from "./explain";
import { type Bundle, predict, type Row } from "./model";
import { mountPortal } from "./portal";
import {
  type ChartState,
  type CycleEvent,
  type Forecast,
  type Html,
  horizonLabel as label,
  type Quality,
  S,
  type SondaMarket,
} from "./sonda";
import "./sonda/tokens.css";
import "./sonda/bundle.css";
import "./sonda/bundle.js";
import "./style.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

// ── datos exportados (make export-web) ───────────────────────
interface Market {
  asset: string;
  last: number;
  change: number;
  ts: string;
  history: { t: string; close: number }[];
  events: CycleEvent[];
  features: string[];
  rows: { t: string[]; values: Row[] };
}

const LABELS: Record<string, string> = {
  brent: "Brent",
  wti: "WTI",
  henry_hub: "Gas natural (Henry Hub)",
  ecb_deposit_rate: "Tipo de depósito del BCE",
  usd_per_eur: "Dólares por euro",
  cny_per_usd: "Yuanes por dólar",
  vix: "Volatilidad bursátil (VIX)",
  wti_fut_open: "Apertura del futuro WTI",
  wti_fut_high: "Máximo del futuro WTI",
  wti_fut_low: "Mínimo del futuro WTI",
  wti_fut_close: "Cierre del futuro WTI",
  wti_fut_volume: "Volumen del futuro WTI",
  copper: "Cobre",
  gold: "Oro",
  dollar_index: "Índice del dólar",
  brent_vol21: "Volatilidad del Brent (21 días)",
};
const CELL: Record<string, string> = { rnn: "RNN simple", lstm: "LSTM", gru: "GRU" };
// Rango del gráfico según el horizonte: desde 1 año, para que se vean los sucesos del ciclo económico
const RANGE: Record<number, string> = { 5: "1A", 21: "1A", 63: "5A", 252: "Todo" };
// Qué puede invalidar la previsión en cada plazo (contexto del enunciado: geopolítica y OPEP+)
const RISKS: Record<number, string> = {
  5: "Una noticia brusca: un recorte de la OPEP+, un ataque a una ruta de petroleros o un dato económico inesperado.",
  21: "Una decisión de la OPEP+ o un cambio rápido en la tensión geopolítica.",
  63: "Un cambio de producción de la OPEP+, un conflicto o un giro en la economía mundial.",
  252: "Una recesión, una guerra o un cambio duradero en la oferta: a un año casi todo puede cambiar.",
};
// Alto fijo alrededor del lienzo: fila de lectura y controles (40), hueco y relleno de la tarjeta
const CHART_CHROME = 40 + 6 + 20 + 24;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

/** Mercado en la forma de Sonda. El WTI solo cubre las filas de entrada exportadas (última ventana). */
function toSonda(mk: Market): SondaMarket {
  const j = mk.features.indexOf("wti");
  return {
    asset: mk.asset,
    unit: "$/bbl",
    last: mk.last,
    change: mk.change,
    ts: mk.ts,
    history: { t: mk.history.map((p) => p.t), close: mk.history.map((p) => p.close) },
    wti: j < 0 ? undefined : { t: mk.rows.t, close: mk.rows.values.map((r) => r[j] as number) },
    events: mk.events,
  };
}

// ── componentes propios de la página ─────────────────────────
/** Panel de previsión: solo la previsión del horizonte elegido; la fiabilidad va en su tarjeta. */
function forecastPanel(m: SondaMarket, f: Forecast): Html {
  const { num, longDate } = S.fmt;
  const target = S.tradingDays(m.ts, f.h)[f.h - 1];
  const q = f.quality;
  // Rango: banda entre los dos extremos sobre una escala que incluye el precio de hoy
  const min = Math.min(f.lo, m.last);
  const max = Math.max(f.hi, m.last);
  const pos = (v: number) => (((v - min) / (max - min || 1)) * 100).toFixed(2);
  const range = `<div class="fp-block"><div class="fp-l">Rango probable (80 %)</div>
    <span class="bx-ib-keys" aria-hidden="true"><span class="${f.mid >= m.last ? "k-l" : "k-r"}" style="left:${pos(m.last)}%">hoy</span><span class="k-fc ${f.mid >= m.last ? "k-r" : "k-l"}" style="left:${pos(f.mid)}%">previsto</span></span>
    <div class="rg-track" role="img" aria-label="Entre ${num(f.lo)} y ${num(f.hi)} dólares; hoy ${num(m.last)}">
      <i class="rg-band" style="left:${pos(f.lo)}%;width:${(Number(pos(f.hi)) - Number(pos(f.lo))).toFixed(2)}%"></i>
      <i class="rg-now" style="left:${pos(m.last)}%"></i><i class="rg-mid" style="left:${pos(f.mid)}%"></i></div>
    <div class="fp-ends"><span style="left:${pos(f.lo)}%">${num(f.lo)} $</span><span style="left:${pos(f.hi)}%">${num(f.hi)} $</span></div></div>`;
  // Cuánto falló cada uno en test: la red frente a decir que el precio seguirá igual, en la misma escala
  const top = q ? Math.max(q.metrics.mae, q.baseline.mae) : 1;
  const bar = (name: string, v: number, ref: boolean) =>
    `<div class="fp-bar${ref ? " is-ref" : ""}"><span>${name}</span><div><i style="width:${((v / top) * 100).toFixed(2)}%"></i></div><b>${num(v)} $</b></div>`;
  const gap = q ? q.metrics.mae / q.baseline.mae - 1 : 0;
  const verdict =
    Math.abs(gap) < 0.005
      ? "La red falla lo mismo que no usar modelo."
      : `La red falla un ${S.fmt.num(Math.abs(gap) * 100, 0)} % ${gap > 0 ? "más" : "menos"} que no usar modelo.`;
  const error = q
    ? `<div class="fp-block"><div class="fp-l">Cuánto falló de media, de ${S.fmt.monthYear(q.period[0])} a ${S.fmt.monthYear(q.period[1])}</div>
        ${bar("La red", q.metrics.mae, false)}${bar("Decir «seguirá igual»", q.baseline.mae, true)}
        <p class="fp-verdict">${verdict}</p></div>`
    : "";
  // Probabilidad de subida: la gota se llena hasta ese nivel
  const up = S.probUp(m.last, f);
  const lead = up >= 0.5;
  const prob = `<div class="pd"><div class="pd-drop" id="drop" role="img" aria-label="Sube ${S.fmt.pct(up)}, baja ${S.fmt.pct(1 - up)}"></div>
    <div><div class="pd-v ${lead ? "bx-up-text" : "bx-down-text"}">${S.fmt.pct(lead ? up : 1 - up)}</div>
      <div class="pd-l">de probabilidad de que ${lead ? "suba" : "baje"}</div>
      <div class="pd-s">${S.fmt.pct(lead ? 1 - up : up)} de que ${lead ? "baje" : "suba"}</div></div></div>`;
  return `<div class="ch"><div><div class="ch-t">Previsión a ${label(f.h)}</div><div class="ch-s">Para el ${longDate(target)}, con una red ${f.model ?? ""}</div></div></div>
    <div class="bx-fc-big"><span class="bx-fc-v">${num(f.mid)} $</span>${S.ui.chg(f.mid - m.last, f.mid / m.last - 1)}</div>
    ${prob}${range}${error}`;
}

/** Fiabilidad de un plazo frente a decir «seguirá igual», por el error medio en test (±2 % = empate). */
function verdictOf(q: Quality): { tone: "up" | "flat" | "down"; label: string; use: string } {
  const gap = q.metrics.mae / q.baseline.mae - 1;
  if (gap <= -0.02)
    return { tone: "up", label: "Mejor que no usar modelo", use: "Aporta información; aun así, fíate más del rango que de la cifra." };
  if (gap < 0.02)
    return { tone: "flat", label: "Igual que no usar modelo", use: "No añade nada a suponer que el precio seguirá igual." };
  return { tone: "down", label: "Peor que no usar modelo", use: "Tómala como orientación, no como un precio seguro." };
}

/** La previsión en palabras: qué significa, qué fiabilidad tiene y qué puede invalidarla. */
function inWords(m: SondaMarket, f: Forecast): Html {
  const { num, longDate } = S.fmt;
  const target = S.tradingDays(m.ts, f.h)[f.h - 1];
  const v = f.quality ? verdictOf(f.quality) : null;
  return `<div class="ch"><div><div class="ch-t">La previsión a ${label(f.h)}, en palabras</div></div></div>
    <dl class="wd">
      <div><dt>Qué significa</dt><dd>Lo más probable es que el Brent valga unos <b class="wd-fc">${num(f.mid, 0)} $</b> el ${longDate(target)}. En 8 de cada 10 casos acabaría entre <b>${num(f.lo, 0)}</b> y <b>${num(f.hi, 0)} $</b>.</dd></div>
      ${v ? `<div><dt>Fiabilidad</dt><dd><span class="wd-tag is-${v.tone}">${v.label}</span> ${v.use}</dd></div>` : ""}
      <div><dt>Qué puede invalidarla</dt><dd>${RISKS[f.h] ?? ""} La red solo ve datos de mercado hasta el ${longDate(m.ts)}; no lee noticias.</dd></div>
    </dl>`;
}

/** Fiabilidad de los cuatro modelos en el test, cada cifra junto a su referencia trivial. */
function reliability(fs: Forecast[], sel: number): Html {
  const { num, pct } = S.fmt;
  const cell = (v: string, ref: string, better: boolean) =>
    `<td><div class="v ${better ? "is-better" : "is-worse"}">${v}</div><div class="r">${ref}</div></td>`;
  const rows = fs
    .filter((f) => f.quality)
    .map((f) => {
      const { metrics: m, baseline: b } = f.quality as Quality;
      const always = b.best_constant === "up" ? "sube" : "baja";
      return `<tr data-h="${f.h}" class="${f.h === sel ? "is-active" : ""}" aria-selected="${f.h === sel}">
        <td><div class="v">${label(f.h)}</div><div class="model">${f.model ?? ""}</div></td>
        ${cell(pct(m.hit_rate), `Diciendo siempre «${always}»: ${pct(b.hit_rate_best_constant)}`, m.hit_rate > b.hit_rate_best_constant)}
        ${cell(`${num(m.mae)} $`, `Si el precio no cambiara: ${num(b.mae)} $`, m.mae < b.mae)}
        ${cell(pct(m.coverage80), "Debería ser 80 %", Math.abs(m.coverage80 - 0.8) <= 0.05)}
      </tr>`;
    })
    .join("");
  return `<table class="rel">
    <thead><tr><th>Horizonte</th>
      <th title="Porcentaje de días en que acierta si el precio sube o baja; la referencia es decir siempre lo mismo">Acierta si sube o baja</th>
      <th title="Diferencia media, en dólares, entre el precio previsto y el real; la referencia es suponer que el precio no cambia">Error medio</th>
      <th title="Veces que el precio real quedó dentro del rango probable; debería ser el 80 %">Dentro del rango</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// ── página ───────────────────────────────────────────────────
async function init() {
  S.theme.init();
  // Sin preferencia guardada se abre en oscuro: el mismo mundo que la página del Brent
  if (!localStorage.getItem("sonda-theme")) S.theme.set("dark");
  S.theme.bind(document);
  $("logo").innerHTML = S.ui.logo({ size: 26 });
  $("theme").innerHTML = S.ui.themeToggle();

  const [bundle, mk, quality] = await Promise.all([
    loadJson<Bundle>("model/manifest.json"),
    loadJson<Market>("data/market.json"),
    loadJson<Quality[]>("data/quality.json"),
  ]);
  const forecasts: Forecast[] = [];
  for (const m of bundle.models) {
    const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
    const [lo, mid, hi] = await predict(ort, session, m, mk.rows.values);
    const drv = await occlusion(ort, session, m, mk.rows.values);
    forecasts.push({
      h: m.horizon as number,
      model: CELL[m.cell ?? ""],
      lo,
      mid,
      hi,
      drivers: drv.map((d) => ({ name: LABELS[d.input] ?? d.input, value: d.value })),
      quality: quality.find((x) => x.horizon === m.horizon),
    });
  }
  const market = toSonda(mk);
  $("asof").textContent = `Datos hasta el ${S.fmt.longDate(mk.ts)}`;

  let sel = 5;
  let chart: { state(): ChartState } | null = null;
  const render = () => {
    const f = forecasts.find((x) => x.h === sel) as Forecast;
    $("tabs").innerHTML = S.ui.horizonTabs(sel);
    $("ph").innerHTML = S.ui.priceHeader(market, f);
    $("panel").innerHTML = forecastPanel(market, f);
    mountDrop($("drop"), S.probUp(market.last, f));
    $("words").innerHTML = inWords(market, f);
    $("cards").innerHTML = S.ui.forecastCards(market, forecasts, sel);
    $("metrics").innerHTML = reliability(forecasts, sel);
    $("drv-t").textContent = `Qué mira el modelo a ${label(sel)}`;
    $("drv").innerHTML = S.ui.drivers(f.drivers);
    if (f.quality) {
      const [a, b] = f.quality.period;
      $("perf-s").textContent = `Comprobada con datos que los modelos no vieron al entrenar (${S.fmt.monthYear(a)} – ${S.fmt.monthYear(b)}). En verde, lo que mejora a la referencia`;
      $("bt-t").textContent = `Real frente a previsto a ${label(sel)}`;
      S.charts.backtest($("bt"), { points: f.quality.backtest, height: 190 });
    }
    mountChart(false);
  };
  // Alto del gráfico: lo que queda de pantalla bajo su cabecera, para verlo entero al abrir
  const chartHeight = () => {
    const top = $("chart").getBoundingClientRect().top + window.scrollY;
    return Math.round(Math.min(760, Math.max(320, window.innerHeight - top - CHART_CHROME)));
  };
  let height = 0;
  // keep: conserva el rango (cambio de tamaño); si no, el rango se ajusta al horizonte
  const mountChart = (keep: boolean) => {
    const st = chart?.state();
    height = chartHeight();
    chart = S.charts.price($("chart"), {
      history: market.history,
      wti: market.wti,
      events: market.events,
      forecast: { path: S.fan(market.last, forecasts, sel, market.ts) },
      range: (keep && st?.range) || (RANGE[sel] ?? "1A"),
      scale: st?.scale ?? "lin",
      kind: st?.kind ?? "line",
      indicators: st?.indicators ?? {},
      height,
    });
  };
  let resizing = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizing);
    resizing = window.setTimeout(() => {
      if (Math.abs(chartHeight() - height) > 24) mountChart(true);
    }, 200);
  });
  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-h]");
    if (!t || t.closest("dialog")) return;
    sel = Number(t.dataset.h);
    render();
  });
  $("loading").remove();
  render();
  mountPortal({ market, forecasts, history: mk.history, onMarketShown: () => mountChart(true) });
}

init().catch((err: Error) => {
  $("loading").textContent = err.message;
});
