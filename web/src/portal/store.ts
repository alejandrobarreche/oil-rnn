// Estado del portal con dinero ficticio: efectivo, posiciones (solo largas), movimientos e historial
// de consultas. Vive en el navegador (localStorage); se exporta e importa en JSON y el historial se
// descarga en CSV. Funciones puras salvo load/save (tests en tests/portal.test.ts).

export const INITIAL_CASH = 10_000;
export const STORAGE_KEY = "sonda-portal-v1";

export interface Position {
  id: string;
  openedAt: string; // fecha y hora real de la operación (ISO)
  dataDate: string; // fecha del precio usado (último dato exportado)
  price: number;
  barrels: number;
  cost: number;
}
export interface Trade {
  id: string;
  at: string;
  dataDate: string;
  kind: "open" | "close";
  price: number;
  barrels: number;
  amount: number;
  pnl?: number; // resultado realizado al cerrar
}
export type RecordKind = "evaluacion" | "si-invertido" | "seguir-modelo" | "apertura" | "cierre";
/** Consulta guardada: textos ya formateados, tal como se vieron, para reabrirla o descargarla. */
export interface HistoryRecord {
  id: string;
  at: string;
  kind: RecordKind;
  title: string;
  params: [string, string][];
  result: [string, string][];
}
export interface PortalState {
  v: 1;
  initial: number;
  cash: number;
  positions: Position[];
  trades: Trade[];
  history: HistoryRecord[];
}

export const KIND_LABEL: Record<RecordKind, string> = {
  evaluacion: "Evaluación",
  "si-invertido": "Si hubiera invertido",
  "seguir-modelo": "Si hubiera seguido al modelo",
  apertura: "Posición abierta",
  cierre: "Posición cerrada",
};

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyState(initial = INITIAL_CASH): PortalState {
  return { v: 1, initial, cash: initial, positions: [], trades: [], history: [] };
}

/** Abre una posición de `amount` $ al precio `price`. Lanza un error si no hay saldo. */
export function openPosition(s: PortalState, amount: number, price: number, dataDate: string, now: string): PortalState {
  if (!(amount > 0)) throw new Error("El importe debe ser mayor que cero.");
  if (amount > s.cash + 1e-9) throw new Error("No hay saldo ficticio suficiente.");
  const barrels = amount / price;
  const id = newId();
  return {
    ...s,
    cash: s.cash - amount,
    positions: [...s.positions, { id, openedAt: now, dataDate, price, barrels, cost: amount }],
    trades: [{ id: newId(), at: now, dataDate, kind: "open", price, barrels, amount }, ...s.trades],
  };
}

/** Cierra entera la posición `id` al precio `price` y suma el resultado al efectivo. */
export function closePosition(s: PortalState, id: string, price: number, dataDate: string, now: string): PortalState {
  const p = s.positions.find((x) => x.id === id);
  if (!p) throw new Error("La posición ya no existe.");
  const amount = p.barrels * price;
  return {
    ...s,
    cash: s.cash + amount,
    positions: s.positions.filter((x) => x.id !== id),
    trades: [
      { id: newId(), at: now, dataDate, kind: "close", price, barrels: p.barrels, amount, pnl: amount - p.cost },
      ...s.trades,
    ],
  };
}

export function addRecord(s: PortalState, r: Omit<HistoryRecord, "id">): PortalState {
  return { ...s, history: [{ id: newId(), ...r }, ...s.history] };
}
export function removeRecord(s: PortalState, id: string): PortalState {
  return { ...s, history: s.history.filter((r) => r.id !== id) };
}

export interface Summary {
  cash: number;
  barrels: number;
  cost: number; // coste de las posiciones abiertas
  value: number; // valor de las posiciones abiertas al precio actual
  unrealized: number;
  realized: number;
  total: number; // efectivo + posiciones
  ret: number; // total frente al capital inicial
}
export function summary(s: PortalState, price: number): Summary {
  const barrels = s.positions.reduce((a, p) => a + p.barrels, 0);
  const cost = s.positions.reduce((a, p) => a + p.cost, 0);
  const value = barrels * price;
  const realized = s.trades.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const total = s.cash + value;
  return { cash: s.cash, barrels, cost, value, unrealized: value - cost, realized, total, ret: total / s.initial - 1 };
}

// ── exportar, importar y descargar ───────────────────────────
const isNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown) => typeof x === "string";
const isPairs = (x: unknown) =>
  Array.isArray(x) && x.every((p) => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isStr(p[1]));

/** Lee un estado exportado y comprueba su forma; lanza un error legible si no es válido. */
export function parseState(text: string): PortalState {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error("El fichero no es un JSON válido.");
  }
  const ok =
    o &&
    o.v === 1 &&
    isNum(o.initial) &&
    isNum(o.cash) &&
    Array.isArray(o.positions) &&
    (o.positions as Position[]).every((p) => isStr(p.id) && isNum(p.price) && isNum(p.barrels) && isNum(p.cost)) &&
    Array.isArray(o.trades) &&
    (o.trades as Trade[]).every((t) => isStr(t.id) && (t.kind === "open" || t.kind === "close") && isNum(t.amount)) &&
    Array.isArray(o.history) &&
    (o.history as HistoryRecord[]).every(
      (r) => isStr(r.id) && isStr(r.at) && r.kind in KIND_LABEL && isStr(r.title) && isPairs(r.params) && isPairs(r.result),
    );
  if (!ok) throw new Error("El fichero no tiene la forma de una cartera de Sonda.");
  return o as unknown as PortalState;
}

/** Historial en CSV con «;» (la coma es el separador decimal en es-ES) y comillas cuando hace falta. */
export function historyCsv(records: HistoryRecord[]): string {
  const cell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const pairs = (p: [string, string][]) => p.map(([k, v]) => `${k}: ${v}`).join(" | ");
  const head = ["fecha", "tipo", "consulta", "parametros", "resultado"];
  const rows = records.map((r) => [r.at, KIND_LABEL[r.kind], r.title, pairs(r.params), pairs(r.result)]);
  return [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
const storage = (): KV | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Estado guardado o uno nuevo si no hay, está dañado o el navegador no deja guardar. */
export function load(kv: KV | null = storage()): PortalState {
  try {
    const raw = kv?.getItem(STORAGE_KEY);
    return raw ? parseState(raw) : emptyState();
  } catch {
    return emptyState();
  }
}
/** Guarda el estado; false si el navegador no lo permite (ventana privada, almacenamiento lleno). */
export function save(s: PortalState, kv: KV | null = storage()): boolean {
  try {
    kv?.setItem(STORAGE_KEY, JSON.stringify(s));
    return !!kv;
  } catch {
    return false;
  }
}
