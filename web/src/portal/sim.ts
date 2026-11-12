// Cálculos del portal con dinero ficticio. Puros y sin dependencias del navegador (tests en
// tests/portal.test.ts). Solo usan precios observados y el backtest de test ya exportado.
import type { BacktestPoint } from "../explain";

export interface PricePoint {
  t: string;
  close: number;
}

/** Máxima caída desde un pico, como fracción negativa (−0,35 = −35 %); 0 si nunca cae. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

/** Rendimiento anual equivalente de un rendimiento total `ret` en `days` días naturales. */
export function annualized(ret: number, days: number): number {
  if (days <= 0) return 0;
  return (1 + ret) ** (365.25 / days) - 1;
}

const DAY_MS = 864e5;
const daysBetween = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;

export interface WhatIf {
  amount: number;
  start: string;
  startPrice: number;
  end: string;
  endPrice: number;
  barrels: number;
  value: number;
  ret: number;
  annual: number;
  drawdown: number;
  curve: { t: string; value: number }[];
}

/** ¿Y si hubiera invertido `amount` el primer día con precio desde `date` y lo mantuviera hasta el
 * último dato? null si la fecha queda fuera del histórico. */
export function whatIf(history: PricePoint[], date: string, amount: number): WhatIf | null {
  const i = history.findIndex((p) => p.t >= date);
  if (i < 0 || i === history.length - 1 || !(amount > 0)) return null;
  const start = history[i];
  const end = history[history.length - 1];
  const barrels = amount / start.close;
  const curve = history.slice(i).map((p) => ({ t: p.t, value: barrels * p.close }));
  const value = barrels * end.close;
  const ret = value / amount - 1;
  return {
    amount,
    start: start.t,
    startPrice: start.close,
    end: end.t,
    endPrice: end.close,
    barrels,
    value,
    ret,
    annual: annualized(ret, daysBetween(start.t, end.t)),
    drawdown: maxDrawdown(curve.map((p) => p.value)),
    curve,
  };
}

export interface FollowModel {
  h: number;
  start: string; // primera fecha objetivo
  end: string; // última fecha objetivo
  periods: number; // tramos sin solape de h días
  invested: number; // tramos en que el modelo preveía subida
  hits: number; // tramos en que acertó si subía o bajaba
  strategy: number; // valor final de 1 $ siguiendo al modelo
  always: number; // valor final de 1 $ siempre invertido
  curve: { t: string; strategy: number; always: number }[];
}

/** ¿Y si hubiera seguido al modelo en el test? Tramos sin solape: uno cada h filas del backtest
 * (t es la fecha objetivo y persistence el precio en el origen). En cada tramo se invierte si la
 * previsión supera al precio del origen y se cobra actual / persistence; si no, se queda en efectivo. */
export function followModel(points: BacktestPoint[], h: number): FollowModel | null {
  const legs = points.filter((_, k) => k % h === 0);
  if (!legs.length) return null;
  let strategy = 1;
  let always = 1;
  let invested = 0;
  let hits = 0;
  const curve: FollowModel["curve"] = [];
  for (const p of legs) {
    const r = p.actual / p.persistence;
    const up = p.pred > p.persistence;
    if (up) {
      strategy *= r;
      invested++;
    }
    always *= r;
    if (up === p.actual > p.persistence) hits++;
    curve.push({ t: p.t, strategy, always });
  }
  return {
    h,
    start: legs[0].t,
    end: legs[legs.length - 1].t,
    periods: legs.length,
    invested,
    hits,
    strategy,
    always,
    curve,
  };
}

export interface Evaluation {
  amount: number;
  h: number;
  last: number;
  barrels: number;
  value: { lo: number; mid: number; hi: number };
  pnl: { lo: number; mid: number; hi: number };
  probGain: number;
}

/** Evaluación de una posición de `amount` abierta al último precio, con la previsión del horizonte:
 * valor en los cuantiles 0,1 · 0,5 · 0,9 y probabilidad de ganar (precio final > último). */
export function evaluate(
  last: number,
  f: { h: number; lo: number; mid: number; hi: number },
  amount: number,
  probGain: number,
): Evaluation {
  const barrels = amount / last;
  const value = { lo: barrels * f.lo, mid: barrels * f.mid, hi: barrels * f.hi };
  return {
    amount,
    h: f.h,
    last,
    barrels,
    value,
    pnl: { lo: value.lo - amount, mid: value.mid - amount, hi: value.hi - amount },
    probGain,
  };
}
