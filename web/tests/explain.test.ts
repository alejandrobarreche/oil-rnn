import { describe, expect, it } from "vitest";
import { backtestBias, fanPath, nextTradingDays, normalCdf, probUp } from "../src/explain";

describe("abanico entre horizontes", () => {
  const f = [
    { h: 5, lo: 90, mid: 100, hi: 110 },
    { h: 21, lo: 80, mid: 120, hi: 160 },
  ];

  it("pasa por los horizontes calculados y los marca", () => {
    const p = fanPath(100, f, 21);
    expect(p).toHaveLength(21);
    expect(p[4].computed).toBe(true);
    expect(p[4].mid).toBeCloseTo(100, 10);
    expect(p[4].lo80).toBeCloseTo(90, 10);
    expect(p[4].hi80).toBeCloseTo(110, 10);
    expect(p[20].mid).toBeCloseTo(120, 10);
    expect(p.filter((x) => x.computed)).toHaveLength(2);
  });

  it("interpola en log-precio y parte del último precio sin incertidumbre", () => {
    const p = fanPath(100, f, 5);
    expect(p).toHaveLength(5);
    expect(p[0].lo80).toBeCloseTo(100 * (90 / 100) ** (1 / 5), 10);
    // entre 5 y 21 días, punto medio geométrico
    expect(fanPath(100, f, 21)[12].mid).toBeCloseTo(Math.sqrt(100 * 120), 10);
  });
});

describe("probabilidad de subida", () => {
  it("Φ en puntos conocidos", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.2816)).toBeCloseTo(0.9, 3);
  });

  it("0,5 si la mediana es el último precio; 0,9 si el cuantil 0,1 coincide con él", () => {
    expect(probUp(100, { h: 5, lo: 90, mid: 100, hi: 100 ** 2 / 90 })).toBeCloseTo(0.5, 6);
    expect(probUp(100, { h: 5, lo: 100, mid: 110, hi: 121 })).toBeCloseTo(0.9, 3);
  });
});

describe("utilidades", () => {
  it("días hábiles sin fines de semana", () => {
    const d = nextTradingDays("2026-11-06", 3).map((x) => x.toISOString().slice(0, 10));
    expect(d).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("sesgo medio del backtest en rendimientos", () => {
    const p = { t: "", lo80: 0, hi80: 0, persistence: 100 };
    const b = backtestBias([
      { ...p, actual: 100, pred: 110 },
      { ...p, actual: 100, pred: 110 },
    ]);
    expect(b.predicted).toBeCloseTo(0.1, 10);
    expect(b.actual).toBeCloseTo(0, 10);
  });
});
