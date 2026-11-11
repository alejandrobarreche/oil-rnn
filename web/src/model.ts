// Preprocesado e inferencia: réplica de src/<paquete>/features.py con los parámetros del manifiesto.
// No depende del navegador, así que la prueba de paridad (tests/) lo ejecuta en Node.

export interface Manifest {
  run_id: string;
  task: "classification" | "regression";
  data_kind: "tabular" | "time_series";
  target: string;
  classes: string[] | null;
  quantiles?: number[] | null;
  conformal?: { correction: number; mode: string } | null;
  features: string[];
  x_mean: number[];
  x_scale: number[];
  x_fill?: number[];
  window?: number;
  horizon?: number;
  target_mode?: "level" | "change" | "log_return";
  target_index?: number | null;
  inputs?: string[];
  transforms?: Transform[];
  floor?: (number | null)[];
  volatility?: number | null;
  clip?: number | null;
  warmup?: number;
  y_mean?: number;
  y_scale?: number;
  model_file: string;
  sha256: string;
  release: string;
}

export type Row = (number | null)[];

export type Transform = "level" | "diff" | "log1p_diff" | "log_diff";

/** Desviación típica muestral (ddof = 1), como pandas rolling().std(). */
function sampleStd(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const ss = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

/** Filas en bruto → entradas sin escalar, réplica de Preprocessor._inputs. Fila t: solo filas <= t. */
export function transformRows(m: Manifest, raw: number[][]): number[][] {
  const kinds = m.transforms ?? m.features.map((): Transform => "level");
  const x = raw.map((row) =>
    row.map((v, j) => {
      const f = m.floor?.[j];
      return f != null ? Math.max(v, f) : v;
    }),
  );
  const change = (kind: Transform, now: number, prev: number) => {
    if (kind === "diff") return now - prev;
    if (kind === "log1p_diff") return Math.log1p(now) - Math.log1p(prev);
    return Math.log(now / prev);
  };
  const out = x.map((row, t) =>
    row.map((v, j) => (kinds[j] === "level" ? v : t === 0 ? Number.NaN : change(kinds[j], v, x[t - 1][j]))),
  );
  const v = m.volatility;
  if (v) {
    const k = m.target_index as number;
    const ret = x.map((row, t) => (t === 0 ? Number.NaN : Math.log(row[k] / x[t - 1][k])));
    out.forEach((row, t) => row.push(t >= v ? sampleStd(ret.slice(t - v + 1, t + 1)) : Number.NaN));
  }
  return out;
}

export interface Prepared {
  data: Float32Array;
  dims: number[];
  last: number;
}

interface TensorLike {
  data: unknown;
}

export interface OrtLike {
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
}

export interface SessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, TensorLike>>;
}

export function preprocess(m: Manifest, rows: Row[]): Prepared {
  const F = m.features.length;
  const c = m.clip;
  const scale = (v: number, j: number) => {
    const z = (v - m.x_mean[j]) / m.x_scale[j];
    return c ? Math.min(Math.max(z, -c), c) : z;
  };

  if (m.data_kind === "time_series") {
    const W = m.window ?? 1;
    const need = W + (m.warmup ?? 0);
    if (rows.length < need) {
      throw new Error(`Hacen falta al menos ${need} filas; hay ${rows.length}.`);
    }
    const raw = rows.slice(-need).map((row, i) =>
      row.map((v, j) => {
        if (v === null || Number.isNaN(v)) {
          throw new Error(`Valor vacío en la fila ${i + 1}, columna ${m.features[j]}.`);
        }
        return v;
      }),
    );
    const inputs = m.inputs ?? m.features;
    const I = inputs.length;
    const data = new Float32Array(W * I);
    transformRows(m, raw)
      .slice(-W)
      .forEach((row, i) =>
        row.forEach((v, j) => {
          if (!Number.isFinite(v)) throw new Error(`Entrada no finita: ${inputs[j]}.`);
          data[i * I + j] = scale(v, j);
        }),
      );
    const last = m.target_index != null ? raw[need - 1][m.target_index] : 0;
    return { data, dims: [1, W, I], last };
  }

  const row = rows[0];
  const data = new Float32Array(F);
  row.forEach((v, j) => {
    const x = v === null || Number.isNaN(v) ? (m.x_fill?.[j] ?? 0) : v;
    data[j] = scale(x, j);
  });
  return { data, dims: [1, F], last: 0 };
}

export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exp = logits.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / sum);
}

/** Corrección conforme del intervalo, réplica de conformal.calibrate_quantiles. */
export function calibrate(
  values: number[],
  quantiles: number[],
  c: { correction: number; mode: string },
): number[] {
  const out = [...values];
  const last = out.length - 1;
  const mid = out[quantiles.indexOf(0.5)];
  const q = c.correction;
  const [lo, hi] =
    c.mode === "log_return"
      ? [out[0] * Math.exp(-q), out[last] * Math.exp(q)]
      : [out[0] - q, out[last] + q];
  out[0] = Math.min(lo, mid);
  out[last] = Math.max(hi, mid);
  return out;
}

/** Salida de la red → valor final (regresión; uno por cuantil si m.quantiles) o probabilidades
 * por clase (clasificación). */
export function postprocess(m: Manifest, output: ArrayLike<number>, p: Prepared): number[] {
  if (m.data_kind === "time_series") {
    const n = m.quantiles?.length || 1;
    const values = Array.from(output)
      .slice(0, n)
      .map((o) => {
        const y = o * (m.y_scale ?? 1) + (m.y_mean ?? 0);
        if (m.target_mode === "change") return p.last + y;
        if (m.target_mode === "log_return") return p.last * Math.exp(y);
        return y;
      });
    return m.conformal && m.quantiles ? calibrate(values, m.quantiles, m.conformal) : values;
  }
  if (m.task === "classification") {
    return softmax(Array.from(output).slice(0, m.classes?.length ?? output.length));
  }
  return [output[0]];
}

export async function predict(
  ort: OrtLike,
  session: SessionLike,
  m: Manifest,
  rows: Row[],
): Promise<number[]> {
  const p = preprocess(m, rows);
  const result = await session.run({ input: new ort.Tensor("float32", p.data, p.dims) });
  return postprocess(m, result.output.data as Float32Array, p);
}

/** CSV con cabecera → filas en el orden de m.features. Celdas vacías → null. */
export function parseCsv(m: Manifest, text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("Pega una cabecera y al menos una fila de datos.");
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = m.features.map((f) => {
    const i = header.indexOf(f);
    if (i < 0) throw new Error(`Falta la columna ${f}.`);
    return i;
  });
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return idx.map((i) => {
      const cell = (cells[i] ?? "").trim();
      return cell === "" ? null : Number(cell);
    });
  });
}

export function toCsv(m: Manifest, rows: Row[]): string {
  return [m.features.join(","), ...rows.map((r) => r.map((v) => v ?? "").join(","))].join("\n");
}
