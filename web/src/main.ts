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
  indicators: Record<string, boolean>;
}

type Html = string;
interface SondaApi {
  theme: { init(): void; bind(root?: ParentNode): void };
  fmt: { longDate(t: string): string };
  horizons: { h: number; label: string; short: string }[];
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
    priceHeader(m: SondaMarket, f: Forecast): Html;
    forecastPanel(m: SondaMarket, f: Forecast): Html;
    forecastCards(m: SondaMarket, fs: Forecast[], selected: number): Html;
    metrics(q: Quality): Html;
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
    const label = S.horizons.find((x) => x.h === sel)?.label ?? `${sel} días`;
    $("tabs").innerHTML = S.ui.horizonTabs(sel);
    $("ph").innerHTML = S.ui.priceHeader(market, f);
    $("panel").innerHTML = S.ui.forecastPanel(market, f);
    $("cards").innerHTML = S.ui.forecastCards(market, forecasts, sel);
    $("perf-t").textContent = `Fiabilidad · ${label}`;
    $("drv-t").textContent = `Variables del modelo · ${label}`;
    $("drv").innerHTML = S.ui.drivers(f.drivers);
    if (f.quality) {
      $("metrics").innerHTML = S.ui.metrics(f.quality);
      S.charts.backtest($("bt"), { points: f.quality.backtest, height: 190 });
    }
    // Al cambiar de horizonte se conservan escala e indicadores, y el rango se ajusta
    const st = chart?.state();
    chart = S.charts.price($("chart"), {
      history: market.history,
      wti: market.wti,
      events: market.events,
      forecast: { path: S.fan(market.last, forecasts, sel, market.ts) },
      range: RANGE[sel] ?? "1A",
      scale: st?.scale ?? "lin",
      indicators: st?.indicators ?? {},
      height: 440,
    });
  };
  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-h]");
    if (!t) return;
    sel = Number(t.dataset.h);
    render();
  });
  render();
  $("loading").remove();
}

init().catch((err: Error) => {
  $("loading").textContent = err.message;
});
