import { describe, expect, it } from "vitest";
import { decimate, frameFor, progressOf, seaPaths, xOf, yearTicks, yOf } from "../src/explica/sea";

const pts = [
  { t: "2000-01-03", close: 20 },
  { t: "2000-01-04", close: 25 },
  { t: "2000-01-05", close: 90 },
  { t: "2000-01-06", close: 30 },
  { t: "2000-01-07", close: 10 },
  { t: "2000-01-10", close: 40 },
];

describe("mar del Brent", () => {
  it("al reducir puntos conserva los extremos, el primero y el último", () => {
    const d = decimate(pts, 4);
    expect(d[0]).toBe(pts[0]);
    expect(d[d.length - 1]).toBe(pts[5]);
    expect(d.map((p) => p.close)).toContain(90);
    expect(d.map((p) => p.close)).toContain(10);
  });

  it("las fechas van de un margen al otro y el precio sube hacia arriba", () => {
    const f = frameFor(pts, 0.1, 0.2, 0.9, 100);
    expect(xOf("2000-01-03", f)).toBeCloseTo(0.1);
    expect(xOf("2000-01-10", f)).toBeCloseTo(0.9);
    expect(xOf("1999-01-01", f)).toBeCloseTo(0.1);
    expect(progressOf("2000-01-10", f)).toBe(1);
    expect(yOf(0, f)).toBeCloseTo(0.9);
    expect(yOf(100, f)).toBeCloseTo(0.2);
  });

  it("la superficie empieza y acaba en calma en los bordes y el agua cierra por el fondo", () => {
    const f = frameFor(pts, 0.1, 0.2, 0.9, 100);
    const { line, water } = seaPaths(pts, f, 1000, 100);
    const r = (v: number) => Math.round(v * 1000) / 10; // como seaPaths: décimas del viewBox
    expect(line.startsWith(`M0,${r(yOf(20, f))} `)).toBe(true);
    expect(line.endsWith(`L1000,${r(yOf(40, f))}`)).toBe(true);
    expect(water.endsWith("L1000,100 L0,100 Z")).toBe(true);
  });

  it("marca los años dentro del tramo", () => {
    const f = frameFor([{ t: "2000-08-30", close: 1 }, { t: "2026-11-03", close: 1 }], 0, 0, 1, 1);
    const ticks = yearTicks(f, 5).map((t) => t.year);
    expect(ticks).toEqual([2005, 2010, 2015, 2020, 2025]);
  });
});
