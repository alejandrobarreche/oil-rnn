// Cálculos de la interfaz que no replican features.py: abanico entre horizontes, probabilidad de
// subida, factores por oclusión y sesgo medido en el backtest. Sin dependencias del navegador.
import {
  type Manifest,
  type OrtLike,
  postprocess,
  preprocess,
  type Row,
  type SessionLike,
} from "./model";

/** Predicción de un horizonte: cuantiles 0,1 · 0,5 · 0,9 en $/bbl. */
export interface HorizonForecast {
  h: number;
  lo: number;
  mid: number;
  hi: number;
}

export interface PathPoint {
  mid: number;
  lo80: number;
  hi80: number;
  computed: boolean; // true en los horizontes que calcula una red; false si es interpolado
}

/** Trayectoria diaria de 1 a H días: interpolación lineal en log-precio entre el último precio
 * (incertidumbre cero) y los horizontes calculados. No es una predicción de la red en los días
 * intermedios; los puntos calculados se marcan. */
export function fanPath(last: number, forecasts: HorizonForecast[], H: number): PathPoint[] {
  const knots = [{ h: 0, lo: last, mid: last, hi: last }, ...forecasts]
    .filter((k) => k.h <= H)
    .sort((a, b) => a.h - b.h);
  const out: PathPoint[] = [];
  for (let d = 1; d <= H; d++) {
    const j = knots.findIndex((k) => k.h >= d);
    const b = knots[j];
    const a = knots[j - 1];
    const w = (d - a.h) / (b.h - a.h);
    const lerp = (x: number, y: number) => Math.exp(Math.log(x) + w * (Math.log(y) - Math.log(x)));
    out.push({
      mid: lerp(a.mid, b.mid),
      lo80: lerp(a.lo, b.lo),
      hi80: lerp(a.hi, b.hi),
      computed: d === b.h,
    });
  }
  return out;
}

/** Φ(z), función de distribución normal estándar (aproximación de Abramowitz y Stegun). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** P(precio al final > último), suponiendo log-precio normal con mediana `mid` y el intervalo
 * 0,1–0,9 como ±1,2816 desviaciones (la regla del contrato de datos de Sonda). */
export function probUp(last: number, f: HorizonForecast): number {
  const sigma = (Math.log(f.hi) - Math.log(f.lo)) / (2 * 1.2816);
  if (!(sigma > 0)) return f.mid > last ? 1 : 0;
  return normalCdf((Math.log(f.mid) - Math.log(last)) / sigma);
}

export interface Driver {
  input: string;
  value: number; // $/bbl: mediana con todos los datos − mediana con esta entrada neutralizada
}

/** Factores por oclusión: cada entrada se fija en su media de train (0 tras estandarizar) en toda
 * la ventana y se mide cuánto cambia la mediana prevista. Explica qué usa el modelo, no por qué
 * se mueve el precio. */
export async function occlusion(
  ort: OrtLike,
  session: SessionLike,
  m: Manifest,
  rows: Row[],
): Promise<Driver[]> {
  const p = preprocess(m, rows);
  const inputs = m.inputs ?? m.features;
  const I = inputs.length;
  const W = p.dims[1];
  const mid = m.quantiles ? m.quantiles.indexOf(0.5) : 0;
  const run = async (data: Float32Array) => {
    const r = await session.run({ input: new ort.Tensor("float32", data, p.dims) });
    return postprocess(m, r.output.data as Float32Array, p)[mid];
  };
  const full = await run(p.data);
  const drivers: Driver[] = [];
  for (let j = 0; j < I; j++) {
    const data = p.data.slice();
    for (let t = 0; t < W; t++) data[t * I + j] = 0;
    drivers.push({ input: inputs[j], value: full - (await run(data)) });
  }
  return drivers.sort((a, b) => b.value - a.value);
}

export interface BacktestPoint {
  t: string;
  actual: number;
  pred: number;
  lo80: number;
  hi80: number;
  persistence: number;
}

/** Rendimiento medio previsto y real a h días en el backtest (log, como fracción). */
export function backtestBias(points: BacktestPoint[]): { predicted: number; actual: number } {
  const mean = (f: (p: BacktestPoint) => number) =>
    points.reduce((s, p) => s + f(p), 0) / points.length;
  return {
    predicted: Math.exp(mean((p) => Math.log(p.pred / p.persistence))) - 1,
    actual: Math.exp(mean((p) => Math.log(p.actual / p.persistence))) - 1,
  };
}

/** Los n días hábiles (lunes a viernes) siguientes a `from` (AAAA-MM-DD). */
export function nextTradingDays(from: string, n: number): Date[] {
  const d = new Date(`${from}T12:00:00Z`);
  const out: Date[] = [];
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(new Date(d));
  }
  return out;
}
