// Tipos del contrato de datos de Sonda (index.d.ts del sistema de diseño) y acceso a window.Sonda,
// que asigna src/sonda/bundle.js. Lo comparten la vista de mercado (main.ts) y el portal.
import type { BacktestPoint } from "./explain";
// bundle.js asigna window.Sonda: se evalúa antes de leerlo, sea cual sea el orden de los imports.
import "./sonda/bundle.js";

export type Html = string;

export interface CycleEvent {
  t: string;
  price: number;
  label: string;
  kind: "max" | "min";
}
export interface Quality {
  horizon: number;
  period: [string, string];
  metrics: { hit_rate: number; mae: number; rmse: number; coverage80: number };
  baseline: { mae: number; rmse: number; hit_rate_best_constant: number; best_constant: "up" | "down" };
  backtest: BacktestPoint[];
}
export interface Series {
  t: string[];
  close: number[];
}
export interface SondaMarket {
  asset: string;
  unit: string;
  last: number;
  change: number;
  ts: string;
  history: Series;
  wti?: Series;
  events: CycleEvent[];
}
export interface Forecast {
  h: number;
  model?: string;
  lo: number;
  mid: number;
  hi: number;
  drivers: { name: string; value: number }[];
  quality?: Quality;
}
export interface PathPoint {
  t: string;
  mid: number;
  lo80: number;
  hi80: number;
  computed: boolean;
}
export interface ChartState {
  range: string;
  scale: string;
  kind: string;
  indicators: Record<string, boolean>;
}

export interface SondaApi {
  theme: { init(): void; bind(root?: ParentNode): void };
  fmt: {
    num(v: number, dp?: number): string;
    signed(v: number, dp?: number, suffix?: string): string;
    pct(v: number, dp?: number): string;
    day(t: string): string;
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
    icon(name: string, size?: number): Html;
    logo(o?: { size?: number }): Html;
    themeToggle(): Html;
    horizonTabs(selected: number): Html;
    chg(abs: number, rel: number): Html;
    badge(text: string, tone?: "up" | "down" | "warn", block?: boolean): Html;
    pill(text: string, o?: { active?: boolean; small?: boolean; solid?: boolean; icon?: string; data?: string }): Html;
    directionMeter(probabilityUp: number): Html;
    priceHeader(m: SondaMarket, f: Forecast): Html;
    forecastCards(m: SondaMarket, fs: Forecast[], selected: number): Html;
    drivers(list: { name: string; value: number }[], n?: number): Html;
  };
}

export const S = (window as unknown as { Sonda: SondaApi }).Sonda;

export const horizonLabel = (h: number) => S.horizons.find((x) => x.h === h)?.label ?? `${h} días`;

/** Escapa texto para insertarlo en HTML (nombres de fichero, textos guardados por el usuario). */
export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
