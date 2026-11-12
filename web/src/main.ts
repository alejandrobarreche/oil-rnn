// Sonda · predicción del Brent. Composición Workspace del sistema de diseño Sonda 2
// (src/sonda/: bundle.js, bundle.css y tokens.css, copiados del artefacto del sistema de diseño):
// sus componentes (window.Sonda.ui), su gráfico interactivo (charts.price) y su backtest, alimentados
// con los datos de make export-web y las predicciones ONNX calculadas en el navegador.
// Versión WebAssembly (CPU): el .wasm se empaqueta con la web, sin depender de un CDN.
import * as ort from "onnxruntime-web/wasm";
import { type BacktestPoint, occlusion } from "./explain";
import { type Bundle, predict, type Row } from "./model";
import "./sonda/tokens.css";
import "./sonda/bundle.css";
import "./sonda/bundle.js";
import "./style.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

// ── datos exportados (make export-web) ───────────────────────
interface CycleEvent {
  t: string;
  price: number;
  label: string;
  kind: "max" | "min";
}
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
interface Quality {
  horizon: number;
  period: [string, string];
  metrics: { hit_rate: number; mae: number; rmse: number; coverage80: number };
  baseline: { mae: number; rmse: number; hit_rate_best_constant: number; best_constant: "up" | "down" };
  backtest: BacktestPoint[];
}

// ── contrato de datos de Sonda (index.d.ts del sistema de diseño) ──
interface Series {
  t: string[];
  close: number[];
}
interface SondaMarket {
  asset: string;
  unit: string;
  last: number;
  change: number;
  ts: string;
  history: Series;
  wti?: Series;
  events: CycleEvent[];
}
interface Forecast {
  h: number;
  model?: string;
  lo: number;
  mid: number;
  hi: number;
  drivers: { name: string; value: number }[];
  quality?: Quality;
}
interface PathPoint {
  t: string;
  mid: number;
  lo80: number;
  hi80: number;
  computed: boolean;
}
interface ChartState {
  range: string;
  scale: string;
  kind: string;
  indicators: Record<string, boolean>;
}

type Html = string;
interface SondaApi {
  theme: { init(): void; bind(root?: ParentNode): void };
  fmt: {
    num(v: number, dp?: number): string;
    pct(v: number, dp?: number): string;
    longDate(t: string): string;
    monthYear(t: string): string;
  };
  horizons: { h: number; label: string; short: string }[];
  tradingDays(from: string, n: number): string[];
  probUp(last: number, f: Forecast): number;
  fan(last: number, forecasts: Forecast[], H: number, from: string): PathPoint[];
  charts: {
    price(
      host: HTMLElement,
      o: {
        history: Series;
        wti?: Series;
        events?: CycleEvent[];
        forecast: { path: PathPoint[] };
        range: string;
        scale: string;
        kind: string;
        indicators: Record<string, boolean>;
        height: number;
      },
    ): { state(): ChartState };
    backtest(host: HTMLElement, o: { points: BacktestPoint[]; height?: number }): void;
  };
  ui: {
    logo(o?: { size?: number }): Html;
    themeToggle(): Html;
    horizonTabs(selected: number): Html;
    chg(abs: number, rel: number): Html;
    badge(text: string, tone?: "up" | "down" | "warn", block?: boolean): Html;
    directionMeter(probabilityUp: number): Html;
    priceHeader(m: SondaMarket, f: Forecast): Html;
    forecastCards(m: SondaMarket, fs: Forecast[], selected: number): Html;
    drivers(list: { name: string; value: number }[], n?: number): Html;
  };
}
const S = (window as unknown as { Sonda: SondaApi }).Sonda;

const LABELS: Record<string, string> = {
  brent: "Brent",
  wti: "WTI",
  henry_hub: "Gas natural (Henry Hub)",
  ecb_deposit_rate: "Tipo de depósito del BCE",
  usd_per_eur: "Dólares por euro",
  cny_per_usd: "Yuanes por dólar",
  vix: "Volatilidad bursátil (VIX)",
  wti_fut_open: "Futuro WTI · apertura",
  wti_fut_high: "Futuro WTI · máximo",
  wti_fut_low: "Futuro WTI · mínimo",
  wti_fut_close: "Futuro WTI · cierre",
  wti_fut_volume: "Futuro WTI · volumen",
  copper: "Cobre",
  gold: "Oro",
  dollar_index: "Índice del dólar",
  brent_vol21: "Volatilidad del Brent (21 días)",
};
const CELL: Record<string, string> = { rnn: "RNN simple", lstm: "LSTM", gru: "GRU" };
// Rango del gráfico según el horizonte elegido (Workspace: 1S → 3M, 1M → 6M, 3M → 1A, 1A → 5A)
const RANGE: Record<number, string> = { 5: "3M", 21: "6M", 63: "1A", 252: "5A" };
// Alto fijo alrededor del lienzo: leyenda (40), controles inferiores (44), huecos y relleno de la tarjeta
const CHART_CHROME = 40 + 44 + 12 + 20 + 24;

const label = (h: number) => S.horizons.find((x) => x.h === h)?.label ?? `${h} días`;
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
  const rows: [string, string, string][] = [
    ["Precio actual", `${num(m.last)} $`, `Último cierre publicado, ${longDate(m.ts)}`],
    [
      "Rango probable",
      `${num(f.lo)} – ${num(f.hi)} $`,
      "Según el modelo, el precio queda dentro 8 de cada 10 veces",
    ],
    ["Modelo", f.model ?? "—", "Red recurrente entrenada para este horizonte"],
  ];
  const better = q ? q.metrics.mae < q.baseline.mae : false;
  return `<div class="bx-card-t">Previsión · ${label(f.h)}</div>
    <div class="bx-fc-big"><span class="bx-fc-v">${num(f.mid)} $</span>${S.ui.chg(f.mid - m.last, f.mid / m.last - 1)}</div>
    <div class="bx-fc-when">${longDate(target)}</div>
    ${S.ui.directionMeter(S.probUp(m.last, f))}
    <dl class="bx-kv" style="margin-top:6px">${rows.map(([k, v, t]) => `<div><dt title="${t}">${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${q ? `<div style="margin-top:auto;padding-top:16px">${S.ui.badge(better ? "Más preciso que «sin cambios»" : "Orientativo · falla más que «sin cambios»", better ? "up" : "warn", true)}</div>` : ""}`;
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
        ${cell(pct(m.hit_rate), `Siempre «${always}»: ${pct(b.hit_rate_best_constant)}`, m.hit_rate > b.hit_rate_best_constant)}
        ${cell(`${num(m.mae)} $`, `Sin cambios: ${num(b.mae)} $`, m.mae < b.mae)}
        ${cell(pct(m.coverage80), "Esperado: 80 %", Math.abs(m.coverage80 - 0.8) <= 0.05)}
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
    $("cards").innerHTML = S.ui.forecastCards(market, forecasts, sel);
    $("metrics").innerHTML = reliability(forecasts, sel);
    $("drv-t").textContent = `Variables del modelo · ${label(sel)}`;
    $("drv").innerHTML = S.ui.drivers(f.drivers);
    if (f.quality) {
      const [a, b] = f.quality.period;
      $("perf-t").textContent = `Fiabilidad · ${S.fmt.monthYear(a)} – ${S.fmt.monthYear(b)}`;
      $("bt-t").textContent = `Real frente a previsto · ${label(sel)}`;
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
    if (!t) return;
    sel = Number(t.dataset.h);
    render();
  });
  $("loading").remove();
  render();
}

init().catch((err: Error) => {
  $("loading").textContent = err.message;
});
