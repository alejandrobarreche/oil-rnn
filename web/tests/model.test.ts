import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import { describe, expect, it } from "vitest";
import { type Manifest, parseCsv, predict, softmax, toCsv } from "../src/model";

const modelDir = new URL("../public/model/", import.meta.url);
const file = (name: string) => fileURLToPath(new URL(name, modelDir));
const exported = existsSync(file("model.onnx")) && existsSync(file("manifest.json"));

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
});

// Paridad: misma entrada → misma salida en TypeScript (ONNX) que en Python (PyTorch).
describe.skipIf(!exported)("paridad con Python (examples.json)", () => {
  it("reproduce las salidas exportadas", async () => {
    const m: Manifest = JSON.parse(readFileSync(file("manifest.json"), "utf8"));
    const examples = JSON.parse(readFileSync(file("examples.json"), "utf8"));
    const session = await ort.InferenceSession.create(file("model.onnx"));
    for (const ex of examples) {
      const out = await predict(ort, session, m, ex.rows);
      out.forEach((v, i) => {
        const expected = ex.expected[i];
        expect(Math.abs(v - expected)).toBeLessThanOrEqual(1e-4 * Math.max(1, Math.abs(expected)));
      });
    }
  });
});
