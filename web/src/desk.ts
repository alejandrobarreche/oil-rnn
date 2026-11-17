// Cálculos de la mesa de compras: sin DOM, para probarlos en Node (tests/desk.test.ts).
// Todo sale de market.json (serie del Brent), quality.json (previsiones de test) y de la red ONNX.

export interface Fc {
  p10: number;
  p50: number;
  p90: number;
}
export interface PricePoint {
  t: string;
  close: number;
}
export interface TestPoint {
  t: string;
  actual: number;
  pred: number;
  lo80: number;
  hi80: number;
}
export interface TestQuality {
  horizon: number;
  period: [string, string];
  metrics: { mae: number; coverage80: number };
  baseline: { mae: number; coverage80: number };
  backtest: TestPoint[];
}
export interface MarketEvent {
  t: string;
  label: string;
}
/** Previsión de un día pasado: la de test que tenía como fecha objetivo `target`. */
export interface PastFc extends Fc {
  target: string;
  real: number;
}
export interface KeyDay {
  t: string;
  i: number;
  price: number;
  title: string;
  /** Previsión por plazo; null si la fecha objetivo aún no ha llegado. */
  h: Record<number, PastFc | null>;
}

/** Barriles que se pueden comprar: de un petrolero pequeño (300.000) a un VLCC (2.000.000). */
export const BARRELS = { min: 300_000, max: 2_000_000, step: 50_000, start: 1_000_000 } as const;

// Eslora típica (m) por capacidad: Handysize, Aframax, Suezmax y VLCC
const LENGTHS: [number, number][] = [
  [300_000, 180],
  [700_000, 245],
  [1_000_000, 275],
  [2_000_000, 330],
];
/** Eslora en metros para una carga, interpolada entre tipos de petrolero. */
export function shipLength(bbl: number): number {
  const v = Math.min(BARRELS.max, Math.max(BARRELS.min, bbl));
  for (let i = 1; i < LENGTHS.length; i++) {
    const [b0, l0] = LENGTHS[i - 1];
    const [b1, l1] = LENGTHS[i];
    if (v <= b1) return l0 + ((v - b0) / (b1 - b0)) * (l1 - l0);
  }
  return LENGTHS[LENGTHS.length - 1][1];
}
/** Nombre llano del barco que hace falta para esa carga. */
export function shipName(bbl: number): string {
  if (bbl < 600_000) return "Pequeño";
  if (bbl < 900_000) return "Mediano";
  if (bbl < 1_500_000) return "Grande";
  return "Gigante";
}

/** Plazos del enunciado en días hábiles. */
export const HORIZONS = [
  { h: 5, n: "1", unit: "semana", long: "en 1 semana" },
  { h: 63, n: "3", unit: "meses", long: "en 3 meses" },
  { h: 252, n: "1", unit: "año", long: "en 1 año" },
] as const;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const nf = (v: number, d = 0) =>
  v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: d, useGrouping: true });
export const usd = (v: number) => `${nf(v, 1)} $`;
/** Millones de dólares: una cifra decimal por debajo de 10. */
export const musd = (v: number) => `${nf(v, Math.abs(v) < 10 ? 1 : 0)} millones de $`;
export const shortDate = (t: string) => `${Number(t.slice(8, 10))} ${MONTHS[Number(t.slice(5, 7)) - 1]}`;
export const longDate = (t: string) => `${shortDate(t)} ${t.slice(0, 4)}`;
export const orderNo = (t: string) => `Nº ${t.slice(2, 4)}-${t.slice(5, 7)}${t.slice(8, 10)}`;

/** Días hábiles (lunes a viernes) después de `from`; el último es la fecha de entrega de «Hoy». */
export function tradingDayAfter(from: string, n: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  let k = 0;
  while (k < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) k++;
  }
  return d.toISOString().slice(0, 10);
}

// Cuantiles de la normal estándar para 0,05, 0,15, …, 0,95 y para 0,9
const Z = [-1.645, -1.036, -0.674, -0.385, -0.126, 0.126, 0.385, 0.674, 1.036, 1.645];
const Z90 = 1.2816;

/** Diez futuros posibles: los cuantiles 5 %, 15 %, …, 95 % de una normal partida que pasa por
 * p10, p50 y p90. Ocho quedan dentro de la franja p10–p90. */
export function tenFutures(f: Fc): number[] {
  const lo = (f.p50 - f.p10) / Z90;
  const hi = (f.p90 - f.p50) / Z90;
  return Z.map((z) => Math.max(0, f.p50 + z * (z < 0 ? lo : hi)));
}

/** Escala de la regla: límites redondeados que incluyen todos los valores, y paso de marca. */
export function rulerScale(values: number[]): { lo: number; hi: number; step: number } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = hi - lo;
  const step = span > 120 ? 20 : span > 50 ? 10 : span > 20 ? 5 : 2;
  lo = Math.max(0, Math.floor((lo - step * 0.6) / step) * step);
  hi = Math.ceil((hi + step * 0.6) / step) * step;
  return { lo, hi, step };
}

/** Previsiones de test por plazo, indexadas por día de partida (h días hábiles antes de `t`). */
export function testByOrigin(history: PricePoint[], quality: TestQuality[]): Map<number, Map<number, PastFc>> {
  const idx = new Map(history.map((p, i) => [p.t, i]));
  const out = new Map<number, Map<number, PastFc>>();
  for (const q of quality) {
    const m = new Map<number, PastFc>();
    for (const p of q.backtest) {
      const i = idx.get(p.t);
      if (i === undefined || i - q.horizon < 0) continue;
      m.set(i - q.horizon, { p10: p.lo80, p50: p.pred, p90: p.hi80, target: p.t, real: p.actual });
    }
    out.set(q.horizon, m);
  }
  return out;
}

/** Días clave del periodo de test, ordenados por fecha: los sucesos de market.json que caen en él,
 * el máximo y el mínimo entre los días con los tres plazos y el último día con el plazo de un año. */
export function keyDays(
  history: PricePoint[],
  quality: TestQuality[],
  events: MarketEvent[],
  horizons: number[] = HORIZONS.map((x) => x.h),
): KeyDay[] {
  const byOrigin = testByOrigin(history, quality);
  const first = byOrigin.get(horizons[0]) ?? new Map();
  const full = [...first.keys()].filter((i) => horizons.every((h) => byOrigin.get(h)?.has(i))).sort((a, b) => a - b);
  if (!full.length) return [];
  const y0 = history[full[0]].t.slice(0, 4);
  const y1 = history[full[full.length - 1]].t.slice(0, 4);
  const picks = new Map<number, string>();
  const idx = new Map(history.map((p, i) => [p.t, i]));
  for (const e of events) {
    const i = idx.get(e.t);
    if (i !== undefined && first.has(i)) picks.set(i, e.label);
  }
  const add = (i: number, title: string) => {
    if (!picks.has(i)) picks.set(i, title);
  };
  add(
    full.reduce((a, b) => (history[b].close > history[a].close ? b : a)),
    `Máximo de ${y0}–${y1}`,
  );
  add(
    full.reduce((a, b) => (history[b].close < history[a].close ? b : a)),
    `Mínimo de ${y0}–${y1}`,
  );
  add(full[full.length - 1], "Hace un año");
  return [...picks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, title]) => ({
      t: history[i].t,
      i,
      price: history[i].close,
      title,
      h: Object.fromEntries(horizons.map((h) => [h, byOrigin.get(h)?.get(i) ?? null])),
    }));
}

/** Diferencia en millones de $ entre esperar y fijar: positiva si el precio subió (fijar ahorró). */
export function saving(price: number, real: number, barrels: number): number {
  return ((real - price) * barrels) / 1e6;
}

/** Frase que resume el resultado de la decisión en un día pasado. */
export function verdict(decision: "fijar" | "esperar", price: number, real: number, barrels: number): string {
  const d = saving(price, real, barrels);
  if (decision === "fijar") {
    return d >= 0 ? `Fijar te ahorró ${musd(d)}.` : `Esperar te habría ahorrado ${musd(-d)}.`;
  }
  return d <= 0 ? `Esperar te ahorró ${musd(-d)}.` : `Fijar te habría ahorrado ${musd(d)}.`;
}
