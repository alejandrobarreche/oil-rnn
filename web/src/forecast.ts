// Cálculos de la previsión sin DOM, para probarlos en Node (tests/forecast.test.ts).
// Todo sale de market.json (serie del Brent), quality.json (métricas de test) y de las redes ONNX.

export interface Fc {
  p10: number;
  p50: number;
  p90: number;
}
export interface PricePoint {
  t: string;
  close: number;
}
export interface TestQuality {
  horizon: number;
  period: [string, string];
  metrics: { mae: number; coverage80: number };
  baseline: { mae: number; coverage80: number };
}

/** Plazos del enunciado en días hábiles: una red por plazo. */
export const HORIZONS = [
  { h: 5, label: "1 semana" },
  { h: 21, label: "1 mes" },
  { h: 63, label: "3 meses" },
  { h: 252, label: "1 año" },
] as const;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const nf = (v: number, d = 0) =>
  v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: d, useGrouping: true });
export const usd = (v: number) => `${nf(v, 1)} $`;
export const shortDate = (t: string) => `${Number(t.slice(8, 10))} ${MONTHS[Number(t.slice(5, 7)) - 1]}`;
export const longDate = (t: string) => `${shortDate(t)} ${t.slice(0, 4)}`;

/** Día hábil (lunes a viernes) `n` días después de `from`: la fecha objetivo de cada plazo. */
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

/** Escala de precios común a los cuatro planos: incluye todos los valores con un margen del 8 %,
 * para que la anchura de las franjas se compare entre plazos. */
export function priceScale(values: number[]): { lo: number; hi: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(hi - lo, 1) * 0.08;
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}

/** Cobertura de la franja del 80 % en test, de la red y de la persistencia, en casos de cada 100. */
export function coverage(q: TestQuality): { net: number; base: number } {
  return { net: Math.round(q.metrics.coverage80 * 100), base: Math.round(q.baseline.coverage80 * 100) };
}
