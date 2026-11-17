import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  keyDays,
  type MarketEvent,
  musd,
  orderNo,
  type PricePoint,
  rulerScale,
  saving,
  type TestQuality,
  tenFutures,
  testByOrigin,
  tradingDayAfter,
  verdict,
} from "../src/desk";

const read = <T>(p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")) as T;

describe("diez futuros", () => {
  it("dejan 8 de 10 dentro de p10–p90 y la mediana en medio", () => {
    const f = { p10: 90, p50: 100, p90: 125 };
    const q = tenFutures(f);
    expect(q).toHaveLength(10);
    expect(q.filter((v) => v >= f.p10 && v <= f.p90)).toHaveLength(8);
    expect((q[4] + q[5]) / 2).toBeGreaterThan(99);
    expect([...q].sort((a, b) => a - b)).toEqual(q);
  });
  it("no bajan de cero", () => {
    expect(Math.min(...tenFutures({ p10: 2, p50: 10, p90: 20 }))).toBeGreaterThanOrEqual(0);
  });
});

describe("regla", () => {
  it("incluye todos los valores con límites redondeados", () => {
    const s = rulerScale([72, 101, 139, 107]);
    expect(s.lo).toBeLessThanOrEqual(72);
    expect(s.hi).toBeGreaterThanOrEqual(139);
    expect(s.lo % s.step).toBe(0);
    expect(s.hi % s.step).toBe(0);
  });
});

describe("fechas y cifras", () => {
  it("salta fines de semana", () => {
    expect(tradingDayAfter("2026-11-06", 1)).toBe("2026-11-09"); // viernes → lunes
    expect(tradingDayAfter("2026-11-03", 5)).toBe("2026-11-10");
  });
  it("formatea millones de dólares y número de orden", () => {
    expect(musd(74.92)).toBe("75 millones de $");
    expect(musd(2.34)).toBe("2,3 millones de $");
    expect(orderNo("2026-11-03")).toBe("Nº 26-1103");
  });
});

describe("resultado de la decisión", () => {
  it("fijar ahorra si el precio sube y esperar si baja", () => {
    expect(saving(100, 110, 1_000_000)).toBeCloseTo(10);
    expect(verdict("fijar", 100, 110, 1_000_000)).toBe("Fijar te ahorró 10 millones de $.");
    expect(verdict("esperar", 100, 110, 1_000_000)).toBe("Fijar te habría ahorrado 10 millones de $.");
    expect(verdict("esperar", 100, 90, 2_000_000)).toBe("Esperar te ahorró 20 millones de $.");
    expect(verdict("fijar", 100, 90, 2_000_000)).toBe("Esperar te habría ahorrado 20 millones de $.");
  });
});

describe("días pasados con los datos publicados", () => {
  const mk = read<{ history: PricePoint[]; events: MarketEvent[] }>("../public/data/market.json");
  const quality = read<TestQuality[]>("../public/data/quality.json");

  it("la previsión de test cae h días hábiles después del día de partida", () => {
    const by = testByOrigin(mk.history, quality);
    for (const q of quality) {
      const [i, f] = [...(by.get(q.horizon) ?? new Map()).entries()][0];
      expect(mk.history[i + q.horizon].t).toBe(f.target);
      expect(mk.history[i + q.horizon].close).toBeCloseTo(f.real, 2);
    }
  });
  it("da días clave de test, ordenados y con la semana siempre disponible", () => {
    const days = keyDays(mk.history, quality, mk.events);
    expect(days.length).toBeGreaterThanOrEqual(3);
    const start = quality[0].period[0];
    for (const d of days) {
      expect(d.h[5]).not.toBeNull();
      expect((d.h[5] as { target: string }).target >= start).toBe(true);
    }
    expect(days.map((d) => d.t)).toEqual([...days.map((d) => d.t)].sort());
  });
});
