import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import { describe, expect, it } from "vitest";
import {
  type Bundle,
  calibrate,
  type Manifest,
  parseCsv,
  predict,
  preprocess,
  softmax,
  toCsv,
  transformRows,
} from "../src/model";

const modelDir = new URL("../public/model/", import.meta.url);
const file = (name: string) => fileURLToPath(new URL(name, modelDir));
const bundle: Bundle | null = existsSync(file("manifest.json"))
  ? JSON.parse(readFileSync(file("manifest.json"), "utf8"))
  : null;
const exported = bundle !== null && bundle.models.every((m) => existsSync(file(m.model_file)));

describe("utilidades", () => {
  it("softmax suma 1", () => {
    expect(softmax([1, 2, 3]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("CSV de ida y vuelta, con celdas vacías", () => {
    const m = { features: ["a", "b"] } as Manifest;
    const rows = [
      [1, null],
      [3.5, 4],
    ];
    expect(parseCsv(m, toCsv(m, rows))).toEqual(rows);
  });

  it("transformaciones como Preprocessor._inputs (cambio diario, suelo, volatilidad)", () => {
    const m = {
      features: ["p", "r", "v", "w"],
      transforms: ["log_diff", "diff", "log1p_diff", "log_diff"],
      floor: [null, null, null, 1],
      volatility: 2,
      target_index: 0,
    } as Manifest;
    const raw = [
      [10, 1, 0, 20],
      [20, -1, 3, -37], // w negativo → suelo de 1
      [10, 2, 7, 5],
    ];
    const out = transformRows(m, raw);
    expect(out[0].every(Number.isNaN)).toBe(true);
    const [p, r, v, w, vol] = out[2];
    expect(p).toBeCloseTo(Math.log(0.5), 12);
    expect(r).toBe(3);
    expect(v).toBeCloseTo(Math.log(8) - Math.log(4), 12);
    expect(w).toBeCloseTo(Math.log(5), 12);
    // desviación típica muestral de [log 2, log 0,5] = |2·log 2| / √2
    expect(vol).toBeCloseTo((2 * Math.log(2)) / Math.SQRT2, 12);
    expect(out[1][4]).toBeNaN(); // antes de warmup = 2 no hay volatilidad
  });

  it("corrección conforme como conformal.calibrate_quantiles", () => {
    const log = { correction: Math.log(1.1), mode: "log_return" };
    const out = calibrate([90, 100, 110], [0.1, 0.5, 0.9], log);
    expect(out[0]).toBeCloseTo(90 / 1.1, 10);
    expect(out[1]).toBe(100);
    expect(out[2]).toBeCloseTo(110 * 1.1, 10);
    // Estrechar no cruza la mediana
    expect(calibrate([99, 100, 101], [0.1, 0.5, 0.9], { correction: -1, mode: "change" })).toEqual([
      100, 100, 100,
    ]);
  });

  it("recorta las entradas estandarizadas a ±clip", () => {
    const m = {
      data_kind: "time_series",
      features: ["a"],
      transforms: ["diff"],
      window: 2,
      warmup: 1,
      x_mean: [0],
      x_scale: [1],
      clip: 5,
    } as Manifest;
    const p = preprocess(m, [[0], [100], [99]]);
    expect(Array.from(p.data)).toEqual([5, -1]);
  });
});

// Paridad: misma entrada → misma salida en TypeScript (ONNX) que en Python (PyTorch).
describe.skipIf(!exported)("paridad con Python (examples.json)", () => {
  const examples = exported ? JSON.parse(readFileSync(file("examples.json"), "utf8")) : {};
  for (const m of bundle?.models ?? []) {
    it(`reproduce las salidas exportadas a ${m.horizon} días`, async () => {
      const session = await ort.InferenceSession.create(file(m.model_file));
      for (const ex of examples[String(m.horizon)]) {
        const out = await predict(ort, session, m, ex.rows);
        out.forEach((v, i) => {
          const expected = ex.expected[i];
          expect(Math.abs(v - expected)).toBeLessThanOrEqual(1e-4 * Math.max(1, Math.abs(expected)));
        });
      }
    });
  }
});
