// Preprocesado e inferencia: réplica de src/<paquete>/features.py con los parámetros del manifiesto.
// No depende del navegador, así que la prueba de paridad (tests/) lo ejecuta en Node.

export interface Manifest {
  run_id: string;
  task: "classification" | "regression";
  data_kind: "tabular" | "time_series";
  target: string;
  classes: string[] | null;
  features: string[];
  x_mean: number[];
  x_scale: number[];
  x_fill?: number[];
  window?: number;
  horizon?: number;
  target_mode?: "level" | "change" | "log_return";
  target_index?: number | null;
  y_mean?: number;
  y_scale?: number;
  model_file: string;
  sha256: string;
  release: string;
}

export type Row = (number | null)[];

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
  const scale = (v: number, j: number) => (v - m.x_mean[j]) / m.x_scale[j];

  if (m.data_kind === "time_series") {
    const W = m.window ?? 1;
    if (rows.length < W) throw new Error(`Hacen falta al menos ${W} filas; hay ${rows.length}.`);
    const win = rows.slice(-W);
    const data = new Float32Array(W * F);
    win.forEach((row, i) =>
      row.forEach((v, j) => {
        if (v === null || Number.isNaN(v)) {
          throw new Error(`Valor vacío en la fila ${i + 1}, columna ${m.features[j]}.`);
        }
        data[i * F + j] = scale(v, j);
      }),
    );
    const last = m.target_index != null ? (win[W - 1][m.target_index] as number) : 0;
    return { data, dims: [1, W, F], last };
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

/** Salida de la red → valor final (regresión) o probabilidades por clase (clasificación). */
export function postprocess(m: Manifest, output: ArrayLike<number>, p: Prepared): number[] {
  if (m.data_kind === "time_series") {
    const y = output[0] * (m.y_scale ?? 1) + (m.y_mean ?? 0);
    if (m.target_mode === "change") return [p.last + y];
    if (m.target_mode === "log_return") return [p.last * Math.exp(y)];
    return [y];
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
