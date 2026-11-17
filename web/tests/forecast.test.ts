import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  coverage,
  downsample,
  futurePos,
  HORIZONS,
  niceTicks,
  priceScale,
  sma,
  type TestQuality,
  tradingDayAfter,
  usd,
} from "../src/forecast";

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

describe("serie", () => {
  it("media móvil sin valores hasta tener n días", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
  it("marcas redondas dentro del rango", () => {
    expect(niceTicks(62, 118, 5)).toEqual([70, 80, 90, 100, 110]);
    expect(niceTicks(84, 104, 4)).toEqual([85, 90, 95, 100]);
  });
  it("los plazos quedan ordenados en el tramo futuro y el año al final", () => {
    const xs = HORIZONS.map((x) => futurePos(x.h));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(xs[3]).toBe(1);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[3] - xs[2]);
  });
});

describe("suavizado", () => {
  it("promedia bloques y acaba en el último valor real", () => {
    const d = downsample([1, 3, 5, 7, 9], 2);
    expect(d.map((p) => p.v)).toEqual([2, 6, 9, 9]);
    expect(d[d.length - 1]).toEqual({ i: 4, v: 9 });
  });
  it("sin bloques deja la serie igual y salta los huecos", () => {
    expect(downsample([null, 2, 3], 1)).toEqual([
      { i: 1, v: 2 },
      { i: 2, v: 3 },
    ]);
  });
});
