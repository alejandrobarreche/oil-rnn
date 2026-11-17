import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coverage, HORIZONS, priceScale, type TestQuality, tradingDayAfter, usd } from "../src/forecast";

const read = <T>(p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as T;

describe("plazos", () => {
  it("son los cuatro del enunciado y coinciden con las métricas de test publicadas", () => {
    expect(HORIZONS.map((x) => x.h)).toEqual([5, 21, 63, 252]);
    const quality = read<TestQuality[]>("../public/data/quality.json");
    expect(quality.map((q) => q.horizon).sort((a, b) => a - b)).toEqual([5, 21, 63, 252]);
  });
});

describe("fechas y cifras", () => {
  it("salta fines de semana", () => {
    expect(tradingDayAfter("2026-11-06", 1)).toBe("2026-11-09"); // viernes → lunes
    expect(tradingDayAfter("2026-11-03", 5)).toBe("2026-11-10");
  });
  it("formatea dólares con coma decimal", () => {
    expect(usd(92.14)).toBe("92,1 $");
  });
});

describe("escala común", () => {
  it("incluye todos los valores con margen y no baja de cero", () => {
    const s = priceScale([72, 101, 139]);
    expect(s.lo).toBeLessThan(72);
    expect(s.hi).toBeGreaterThan(139);
    expect(priceScale([1, 2]).lo).toBeGreaterThanOrEqual(0);
  });
});

describe("cobertura", () => {
  it("da casos de cada 100 para la red y la persistencia", () => {
    const q: TestQuality = {
      horizon: 5,
      period: ["2023-01-25", "2026-11-03"],
      metrics: { mae: 3.7, coverage80: 0.7822 },
      baseline: { mae: 3.6, coverage80: 0.7927 },
    };
    expect(coverage(q)).toEqual({ net: 78, base: 79 });
  });
});
