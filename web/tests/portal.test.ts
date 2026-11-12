import { describe, expect, it } from "vitest";
import type { BacktestPoint } from "../src/explain";
import { annualized, evaluate, followModel, maxDrawdown, whatIf } from "../src/portal/sim";
import {
  addRecord,
  closePosition,
  emptyState,
  historyCsv,
  load,
  openPosition,
  parseState,
  STORAGE_KEY,
  save,
  summary,
} from "../src/portal/store";

const NOW = "2026-11-12T10:00:00.000Z";

describe("¿y si hubiera invertido?", () => {
  const hist = [
    { t: "2020-01-02", close: 50 },
    { t: "2020-01-03", close: 100 },
    { t: "2020-01-06", close: 40 },
    { t: "2021-01-04", close: 80 },
  ];

  it("empieza el primer día con precio desde la fecha y valora al último", () => {
    const w = whatIf(hist, "2020-01-01", 1000);
    expect(w?.start).toBe("2020-01-02");
    expect(w?.barrels).toBeCloseTo(20, 10);
    expect(w?.value).toBeCloseTo(1600, 10);
    expect(w?.ret).toBeCloseTo(0.6, 10);
    expect(w?.drawdown).toBeCloseTo(-0.6, 10); // de 100 a 40
    expect(w?.curve).toHaveLength(4);
  });

  it("devuelve null fuera del histórico o sin importe", () => {
    expect(whatIf(hist, "2022-01-01", 1000)).toBeNull();
    expect(whatIf(hist, "2021-01-04", 1000)).toBeNull(); // el último día no deja tramo
    expect(whatIf(hist, "2020-01-01", 0)).toBeNull();
  });

  it("anualiza y mide caídas", () => {
    expect(annualized(0.21, 365.25 * 2)).toBeCloseTo(0.1, 10);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
    expect(maxDrawdown([10, 5, 20, 15])).toBeCloseTo(-0.5, 10);
  });
});

describe("¿y si hubiera seguido al modelo?", () => {
  const pt = (t: string, persistence: number, pred: number, actual: number): BacktestPoint => ({
    t,
    persistence,
    pred,
    actual,
    lo80: actual,
    hi80: actual,
  });
  // h = 2: solo cuentan las filas 0, 2 y 4 (tramos sin solape)
  const bt = [
    pt("a", 100, 110, 120), // invierte y gana: ×1,2
    pt("x", 1, 99, 99), // solapada: se ignora
    pt("b", 120, 100, 60), // no invierte; el precio cae a la mitad
    pt("y", 1, 99, 99),
    pt("c", 60, 70, 54), // invierte y pierde: ×0,9
  ];

  it("usa tramos sin solape y solo invierte cuando prevé subida", () => {
    const r = followModel(bt, 2);
    expect(r?.periods).toBe(3);
    expect(r?.invested).toBe(2);
    expect(r?.strategy).toBeCloseTo(1.2 * 0.9, 10);
    expect(r?.always).toBeCloseTo(1.2 * 0.5 * 0.9, 10);
    expect(r?.hits).toBe(2); // acierta a y b, falla c
    expect(r?.start).toBe("a");
    expect(r?.end).toBe("c");
  });
});

describe("evaluación", () => {
  it("valora los barriles en los tres cuantiles", () => {
    const e = evaluate(100, { h: 5, lo: 90, mid: 105, hi: 120 }, 1000, 0.6);
    expect(e.barrels).toBeCloseTo(10, 10);
    expect(e.value.mid).toBeCloseTo(1050, 10);
    expect(e.pnl.lo).toBeCloseTo(-100, 10);
    expect(e.pnl.hi).toBeCloseTo(200, 10);
    expect(e.probGain).toBe(0.6);
  });
});

describe("cartera ficticia", () => {
  it("abre y cierra posiciones con su resultado", () => {
    let s = openPosition(emptyState(10_000), 1000, 100, "2026-11-03", NOW);
    expect(s.cash).toBeCloseTo(9000, 10);
    expect(summary(s, 110).unrealized).toBeCloseTo(100, 10);
    s = closePosition(s, s.positions[0].id, 110, "2026-11-03", NOW);
    const sm = summary(s, 110);
    expect(s.positions).toHaveLength(0);
    expect(sm.realized).toBeCloseTo(100, 10);
    expect(sm.total).toBeCloseTo(10_100, 10);
    expect(sm.ret).toBeCloseTo(0.01, 10);
  });

  it("rechaza abrir sin saldo o con importe no positivo", () => {
    expect(() => openPosition(emptyState(500), 501, 100, "d", NOW)).toThrow(/saldo/);
    expect(() => openPosition(emptyState(500), 0, 100, "d", NOW)).toThrow();
  });
});

describe("exportar, importar y descargar", () => {
  const withRecord = addRecord(openPosition(emptyState(), 2500, 107.03, "2026-11-03", NOW), {
    at: NOW,
    kind: "evaluacion",
    title: 'Evaluación; "1 semana"',
    params: [["Importe", "1.000,00 $"]],
    result: [["Valor previsto", "1.040,73 $"]],
  });

  it("ida y vuelta por JSON y por almacenamiento", () => {
    expect(parseState(JSON.stringify(withRecord))).toEqual(withRecord);
    const mem = new Map<string, string>();
    const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(save(withRecord, kv)).toBe(true);
    expect(mem.has(STORAGE_KEY)).toBe(true);
    expect(load(kv)).toEqual(withRecord);
  });

  it("rechaza ficheros con otra forma y arranca de cero si lo guardado está dañado", () => {
    expect(() => parseState("no es json")).toThrow(/JSON/);
    expect(() => parseState(JSON.stringify({ v: 1, cash: "x" }))).toThrow(/forma/);
    expect(load({ getItem: () => "{roto", setItem: () => undefined })).toEqual(emptyState());
    expect(load(null)).toEqual(emptyState());
  });

  it("escribe el CSV con «;» y comillas cuando hace falta", () => {
    const [head, row] = historyCsv(withRecord.history).split("\r\n");
    expect(head).toBe("fecha;tipo;consulta;parametros;resultado");
    expect(row).toBe(
      `${NOW};Evaluación;"Evaluación; ""1 semana""";Importe: 1.000,00 $;Valor previsto: 1.040,73 $`,
    );
  });
});
