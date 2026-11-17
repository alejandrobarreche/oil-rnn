// Mesa de compras del Brent. Una portada con el petrolero y las tres palabras del proceso; al empezar,
// la mesa: carga (barriles), entrega (plazo) y decisión (fijar o esperar), con la orden de compra a la
// derecha. «Hoy» calcula p10, p50 y p90 en el navegador con los modelos ONNX de make export-web sobre
// las últimas filas de market.json; «En el pasado» usa las previsiones de test (quality.json, fuera de
// muestra) de días clave de 2023–2026 y revela el precio que llegó después.
import * as ort from "onnxruntime-web/wasm";
import {
  BARRELS,
  type Fc,
  HORIZONS,
  type KeyDay,
  keyDays,
  longDate,
  type MarketEvent,
  musd,
  nf,
  orderNo,
  type PricePoint,
  rulerScale,
  shipLength,
  shipName,
  shortDate,
  type TestQuality,
  tenFutures,
  tradingDayAfter,
  usd,
  verdict,
} from "./desk";
import * as I from "./icons";
import { type Bundle, predict, type Row } from "./model";
import { createShip } from "./ship";
import "./product.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

interface Market {
  last: number;
  ts: string;
  history: PricePoint[];
  events: MarketEvent[];
  rows: { t: string[]; values: Row[] };
}
type DayFc = Fc & { target: string; real?: number };
interface Day {
  id: string;
  t: string;
  price: number;
  title: string;
  h: Record<number, DayFc | null>;
}
type Step = "dia" | "carga" | "entrega" | "decision";
type Decision = "fijar" | "esperar";
type Ctx = ReturnType<typeof makeCtx>;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const restart = (el: HTMLElement, cls: string) => {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};
const PAST = 126; // días hábiles de historia en el gráfico de plazos
const STEP_NAMES: Record<Step, string> = { dia: "Día", carga: "Carga", entrega: "Entrega", decision: "Decisión" };

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

// Estado de la mesa
const S = {
  mode: "hoy" as "hoy" | "pasado",
  step: 0,
  picks: {} as Partial<Record<Step, string>>,
  bbl: BARRELS.start as number,
  closed: false,
  busy: false,
};
let today: Day;
let past: Day[] = [];
let targets: Record<number, string> = {};

function makeCtx() {
  const isPast = S.mode === "pasado";
  const day = isPast ? (past.find((d) => d.id === S.picks.dia) ?? null) : today;
  const bbl = S.picks.carga ? Number(S.picks.carga) : 0;
  const hz = HORIZONS.find((x) => String(x.h) === S.picks.entrega) ?? null;
  const f = day && hz ? day.h[hz.h] : null;
  const target = hz ? (isPast ? (f?.target ?? null) : targets[hz.h]) : null;
  return { isPast, day, bbl, hz, f, target, dec: (S.picks.decision ?? null) as Decision | null, m: bbl / 1e6 };
}

async function init() {
  $("theme").innerHTML = I.theme;
  document.querySelector(".howlink")?.insertAdjacentHTML("beforeend", I.arrow);
  const ship = createShip();
  ship.size(shipLength(S.bbl));
  $("introShip").appendChild(ship.el);

  const [mk, quality] = await Promise.all([
    loadJson<Market>("data/market.json"),
    loadJson<TestQuality[]>("data/quality.json"),
  ]);
  const qOf = (h: number) => quality.find((q) => q.horizon === h);
  const histIdx = new Map(mk.history.map((p, i) => [p.t, i]));
  const testYears = (() => {
    const q = qOf(5) ?? quality[0];
    return `${q.period[0].slice(0, 4)}–${q.period[1].slice(2, 4)}`;
  })();
  const steps = (): Step[] =>
    S.mode === "pasado" ? ["dia", "carga", "entrega", "decision"] : ["carga", "entrega", "decision"];
  const ctx = makeCtx;

  // «Hoy»: precio de partida y fechas de entrega; p10–p90 llegan cuando la red termina en el navegador
  today = { id: "hoy", t: mk.ts, price: mk.last, title: "Hoy", h: Object.fromEntries(HORIZONS.map((x) => [x.h, null])) };
  targets = Object.fromEntries(HORIZONS.map((x) => [x.h, tradingDayAfter(mk.ts, x.h)]));
  const ready = (async () => {
    const bundle = await loadJson<Bundle>("model/manifest.json");
    for (const x of HORIZONS) {
      const m = bundle.models.find((mm) => mm.horizon === x.h);
      if (!m) throw new Error(`Falta el modelo de ${x.h} días en manifest.json.`);
      const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
      const [p10, p50, p90] = await predict(ort, session, m, mk.rows.values);
      today.h[x.h] = { p10, p50, p90, target: targets[x.h] };
    }
    // Si se está en la entrega, el gráfico de plazos se completa al llegar la red
    if (S.mode === "hoy" && steps()[S.step] === "entrega") refreshHz();
  })();
  ready.catch(() => undefined);

  // «En el pasado»: días clave del periodo de test
  past = keyDays(mk.history, quality, mk.events).map((d: KeyDay) => ({
    id: d.t,
    t: d.t,
    price: d.price,
    title: d.title,
    h: d.h,
  }));

  // ── modo ──
  function renderModes() {
    const isPast = S.mode === "pasado";
    for (const [id, on] of [
      ["segHoy", !isPast],
      ["segPas", isPast],
    ] as const) {
      $(id).classList.toggle("on", on);
      $(id).setAttribute("aria-pressed", String(on));
    }
  }

  // ── pasos ──
  function buildNav() {
    $("stepBtns").innerHTML = steps()
      .map(
        (k, i) =>
          `<button type="button" class="stepbtn" data-step="${i}"><span class="mark" aria-hidden="true"></span><span class="num">${i + 1}</span><span>${STEP_NAMES[k]}</span></button>`,
      )
      .join("");
    updateNav();
  }
  function updateNav() {
    const n = steps().length;
    $("stepBtns")
      .querySelectorAll<HTMLButtonElement>(".stepbtn")
      .forEach((b, i) => {
        const done = i < S.step || S.closed;
        const current = i === S.step && !S.closed;
        b.className = `stepbtn ${done ? "done" : current ? "current" : "next"}`;
        b.disabled = !done;
        if (current) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
    $("prog").style.transform = `scaleX(${(S.closed ? n : S.step) / n})`;
  }

  // ── día (modo pasado) ──
  const tile = (field: Step, v: string, i: number, body: string, extra = "") =>
    `<button type="button" class="tile a-rise${S.picks[field] === v ? " on" : ""}" data-pick="${field}" data-v="${v}" style="animation-delay:${i * 50}ms" ${extra}>${body}</button>`;
  const tilesDia = () =>
    past
      .map((d, i) =>
        tile(
          "dia",
          d.id,
          i,
          `<span class="t-year">${d.t.slice(0, 4)}</span><span class="t-title">${d.title}</span><span class="t-sub num">${shortDate(d.t)}, a ${usd(d.price)}</span>`,
        ),
      )
      .join("");

  // ── carga: deslizador de barriles; el barco cambia de eslora y se hunde al cargar ──
  function cargaHTML() {
    const pct = (v: number) => ((v - BARRELS.min) / (BARRELS.max - BARRELS.min)) * 100;
    const marks = [300_000, 700_000, 1_000_000, 2_000_000]
      .map((v) => `<span class="sl-mark num" style="left:${pct(v)}%">${nf(v)}</span>`)
      .join("");
    return `<div class="shipslot" id="shipSlot"></div>
      <div class="cargo a-rise">
        <div class="cargo-read"><span class="cargo-n num" id="bblN"></span><span class="cargo-u">barriles</span><span class="cargo-k" id="bblK"></span></div>
        <div class="sl">
          <input type="range" id="bbl" min="${BARRELS.min}" max="${BARRELS.max}" step="${BARRELS.step}" value="${S.bbl}" aria-label="Barriles" />
          <div class="sl-marks">${marks}</div>
        </div>
        <div class="actions"><button type="button" class="btn primary" id="loadBtn">Cargar el barco</button></div>
      </div>`;
  }
  function bindCarga() {
    const input = $<HTMLInputElement>("bbl");
    const show = () => {
      S.bbl = Number(input.value);
      $("bblN").textContent = nf(S.bbl);
      $("bblK").textContent = `Barco ${shipName(S.bbl).toLowerCase()}`;
      input.style.setProperty("--f", String((S.bbl - BARRELS.min) / (BARRELS.max - BARRELS.min)));
      ship.size(shipLength(S.bbl));
    };
    input.addEventListener("input", show);
    show();
    $("loadBtn").addEventListener("click", () => {
      if (S.busy) return;
      S.busy = true;
      S.picks.carga = String(S.bbl);
      input.disabled = true;
      ship.load(true);
      updateTicket();
      setTimeout(() => void go(S.step + 1), reduced() ? 300 : 1300);
    });
  }

  // ── entrega: plazos y, debajo, la franja de cada plazo sobre el tiempo real ──
  const tilesEntrega = (c: Ctx) =>
    HORIZONS.map((x, i) => {
      const date = c.isPast ? c.day?.h[x.h]?.target : targets[x.h];
      const off = !date;
      return tile(
        "entrega",
        String(x.h),
        i,
        `<span class="t-when"><span class="t-n">${x.n}</span><span class="t-unit">${x.unit}</span></span><span class="t-sub num">${off ? "Aún no ha llegado" : longDate(date)}</span>`,
        off ? "disabled" : "",
      );
    }).join("");
  function hzHTML(c: Ctx) {
    const day = c.day as Day;
    const fs = HORIZONS.map((x) => ({ x, f: day.h[x.h] })).filter((o) => o.f) as {
      x: (typeof HORIZONS)[number];
      f: DayFc;
    }[];
    if (!fs.length) return '<p class="rcap">Calculando la franja con la red…</p>';
    // Últimos seis meses reales hasta el día de partida, a la izquierda; las franjas, a la derecha
    const end = histIdx.get(day.t) ?? mk.history.length - 1;
    const hist = mk.history.slice(Math.max(0, end - PAST), end + 1);
    const lo = Math.min(day.price, ...hist.map((p) => p.close), ...fs.map((o) => o.f.p10));
    const hi = Math.max(day.price, ...hist.map((p) => p.close), ...fs.map((o) => o.f.p90));
    const pad = (hi - lo) * 0.08;
    const y = (v: number) => (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * 100;
    const x = (h: number) => 2 + ((h + PAST) / (PAST + 252)) * 94;
    const start = c.isPast ? shortDate(day.t) : "Hoy";
    const bars = fs
      .map(
        ({ x: hz, f }) => `
        <div class="hz-bar" data-h="${hz.h}" style="left:${x(hz.h)}%;top:${y(f.p90)}%;height:${y(f.p10) - y(f.p90)}%"><i style="top:${((f.p90 - f.p50) / (f.p90 - f.p10)) * 100}%"></i></div>
        <div class="hz-rng num" data-h="${hz.h}" style="left:${x(hz.h)}%;top:${y(f.p90)}%"><b>${hz.n} ${hz.unit}</b>${nf(f.p10)}–${nf(f.p90)} $</div>`,
      )
      .join("");
    const aria = fs.map((o) => `${o.x.long}, entre ${usd(o.f.p10)} y ${usd(o.f.p90)}`).join("; ");
    return `<p class="rcap">Cuanto más lejos, más ancha la franja</p>
      <div class="hz" id="hz" data-sel="${S.picks.entrega ?? ""}" role="img" aria-label="${start} ${usd(day.price)}. ${aria}.">
        <div class="hz-plot">
          <svg class="hz-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${hist
            .map((p, i) => `${x(i - (hist.length - 1)).toFixed(2)},${y(p.close).toFixed(2)}`)
            .join(" ")}"/></svg>
          <div class="hz-today" style="top:${y(day.price)}%;left:${x(0)}%"></div>
          <i class="hz-dot" style="top:${y(day.price)}%;left:${x(0)}%"></i>
          ${bars}
        </div>
        <div class="hz-axis"><span class="hz-lab hz-ago" style="left:${x(-PAST)}%">Hace 6 meses</span><span class="hz-lab hz-now num" style="left:${x(0)}%">${start} ${usd(day.price)}</span></div>
      </div>`;
  }
  function refreshHz() {
    const box = document.getElementById("hzBox");
    if (box) box.innerHTML = hzHTML(ctx());
  }

  // ── decisión: regla de precios y dos opciones compactas ──
  function rulerData(c: Ctx) {
    const f = c.f as DayFc;
    const p0 = (c.day as Day).price;
    const qs = tenFutures(f);
    const vals = [p0, ...qs, f.p10, f.p90];
    if (c.isPast && f.real != null) vals.push(f.real);
    const sc = rulerScale(vals);
    const pos = (v: number) => ((v - sc.lo) / (sc.hi - sc.lo)) * 100;
    const at = (v: number) => {
      const x = pos(v);
      const t = x < 15 ? "translateX(-8px)" : x > 85 ? "translateX(calc(-100% + 8px))" : "translateX(-50%)";
      return `left:${x}%;transform:${t}`;
    };
    return { f, p0, qs, ...sc, pos, at };
  }
  function rulerHTML(c: Ctx) {
    const R = rulerData(c);
    const f = R.f;
    let ticks = "";
    let labs = "";
    for (let v = R.lo, i = 0; v <= R.hi + 1e-9; v += R.step / 2, i++) {
      const major = i % 2 === 0;
      ticks += `<div class="r-tick" style="left:${R.pos(v)}%;height:${major ? 12 : 6}px"></div>`;
      if (major) labs += `<div class="r-lab num${(i / 2) % 2 ? " alt" : ""}" style="left:${R.pos(v)}%">${nf(v)}</div>`;
    }
    const dots = R.qs
      .map(
        (q, i) =>
          `<span class="dot${i === 0 || i === 9 ? " out" : ""}" style="left:${R.pos(q)}%;animation-delay:${300 + i * 40}ms"></span>`,
      )
      .join("");
    const start = `${c.isPast ? shortDate((c.day as Day).t) : "Hoy"} ${usd(R.p0)}`;
    const aria = `${start}. Lo probable, ${usd(f.p50)}. Ocho de cada diez futuros entre ${usd(f.p10)} y ${usd(f.p90)}.`;
    return `<div class="rulerbox">
      <p class="rcap">10 futuros posibles; 8 caen en la franja</p>
      <div class="ruler" id="ruler" role="img" aria-label="${aria}">
        <div class="r-today" style="left:${R.pos(R.p0)}%"></div>
        <div class="r-today-l num" style="${R.at(R.p0)}">${start}</div>
        ${dots}
        <div class="r-band a-band" style="left:${R.pos(f.p10)}%;width:${R.pos(f.p90) - R.pos(f.p10)}%"></div>
        <div class="r-med a-band" style="left:${R.pos(f.p50)}%"></div>
        <div class="r-axis"></div>
        ${ticks}${labs}
        <div class="r-med-l num a-band" style="${R.at(f.p50)}">Lo probable ${usd(f.p50)}</div>
      </div></div>`;
  }
  function decisionHTML(c: Ctx) {
    const f = c.f as DayFc;
    const p0 = (c.day as Day).price;
    return `<div class="grid cols-240" id="decTiles">
      <button type="button" class="tile dec a-rise" data-pick="decision" data-v="fijar" style="animation-delay:420ms">
        <span class="t-dlabel">${c.isPast ? "Fijar el precio ese día" : "Fijar el precio hoy"}</span>
        <span class="t-dcost num">${musd(p0 * c.m)}</span>
        <span class="t-sub">Pase lo que pase</span></button>
      <button type="button" class="tile dec a-rise" data-pick="decision" data-v="esperar" style="animation-delay:470ms">
        <span class="t-dlabel">Esperar a la entrega</span>
        <span class="t-dcost num">${musd(f.p50 * c.m)}</span>
        <span class="t-sub num">Lo probable; hasta ${musd(f.p90 * c.m)}</span></button>
    </div>`;
  }

  function renderStage() {
    const c = ctx();
    const cur = steps()[S.step];
    const st = $("stage");
    if (cur === "dia") st.innerHTML = `<div class="block a-enter"><div class="grid cols-200">${tilesDia()}</div></div>`;
    else if (cur === "carga") {
      st.innerHTML = `<div class="block fill a-enter">${cargaHTML()}</div>`;
      $("shipSlot").appendChild(ship.el);
      // Al volver a la carga, el barco vuelve vacío para elegir de nuevo
      delete S.picks.carga;
      ship.load(false);
      bindCarga();
      updateTicket();
    } else if (cur === "entrega")
      st.innerHTML = `<div class="block a-enter"><div class="grid cols-180">${tilesEntrega(c)}</div><div id="hzBox">${hzHTML(c)}</div></div>`;
    else st.innerHTML = `<div class="block a-enter" id="decBlock"><div id="decHead"></div>${rulerHTML(c)}${decisionHTML(c)}</div>`;
  }

  // Resalta en el gráfico de plazos el que se señala o se enfoca
  const highlight = (e: Event) => {
    const hz = document.getElementById("hz");
    if (!hz) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-pick="entrega"]');
    hz.dataset.sel = t?.dataset.v ?? S.picks.entrega ?? "";
  };
  $("stage").addEventListener("pointerover", highlight);
  $("stage").addEventListener("focusin", highlight);
  $("stage").addEventListener("pointerleave", highlight);

  function closeOrder() {
    const c = ctx();
    const day = c.day as Day;
    const f = c.f as DayFc;
    S.closed = true;
    let title: string;
    let text: string;
    if (!c.isPast) {
      title = "Orden cerrada.";
      text =
        c.dec === "fijar"
          ? `Pagas ${musd(day.price * c.m)} pase lo que pase.`
          : `Lo probable son ${musd(f.p50 * c.m)}. Ten reservados ${musd(f.p90 * c.m)} por si sube.`;
    } else {
      const real = f.real as number;
      title = verdict(c.dec as Decision, day.price, real, c.bbl);
      const inside = real >= f.p10 && real <= f.p90;
      text = `El ${longDate(f.target)} el Brent valía ${usd(real)}, ${inside ? "dentro" : "fuera"} de la franja de la red.`;
      const R = rulerData(c);
      $("ruler").insertAdjacentHTML(
        "beforeend",
        `<div class="r-real-l num a-land" style="${R.at(real)}">Lo que pasó ${usd(real)}</div><div class="r-real a-land" style="left:${R.pos(real)}%"></div>`,
      );
    }
    $("decHead").innerHTML = `<div class="block a-enter tight"><h2 class="h2">${title}</h2><p class="lead num">${text}</p></div>`;
    $("decTiles").remove();
    $("decBlock").insertAdjacentHTML(
      "beforeend",
      `<div class="actions a-rise" style="animation-delay:380ms">
        <button type="button" class="btn primary" data-act="again">${c.isPast ? "Otro día" : "Nueva orden"}</button>
        <button type="button" class="btn" data-act="switch">${c.isPast ? "Volver a hoy" : "Pruébalo en el pasado"}</button></div>`,
    );
    const t = $("ticket");
    t.insertAdjacentHTML("beforeend", '<div class="stamp" id="stamp">Cerrada</div>');
    restart(t, "thud");
    updateNav();
    updateTicket();
    S.busy = false;
  }

  // ── orden de compra ──
  function ticketLines(): [string, string, string][] {
    const c = ctx();
    const L: [string, string, string][] = [];
    if (c.isPast) L.push(["dia", "Día", c.day ? `${longDate(c.day.t)}, a ${usd(c.day.price)}` : ""]);
    L.push(["carga", "Carga", c.bbl ? `${nf(c.bbl)} barriles` : ""]);
    L.push(["entrega", "Entrega", c.target && c.hz ? `${longDate(c.target)}, ${c.hz.long}` : ""]);
    L.push([
      "decision",
      "Decisión",
      c.dec === "fijar" && c.day ? `Fijar a ${usd(c.day.price)}` : c.dec === "esperar" ? "Esperar a la entrega" : "",
    ]);
    if (!c.isPast && c.dec === "esperar" && c.f) L.push(["reserva", "Reserva", musd(c.f.p90 * c.m)]);
    const q = c.hz ? qOf(c.hz.h) : undefined;
    if (q)
      L.push([
        "rango",
        `Franja, test ${testYears}`,
        `Acierta ${nf(q.metrics.coverage80 * 100)} de cada 100; «precio de hoy», ${nf(q.baseline.coverage80 * 100)}`,
      ]);
    if (c.isPast && S.closed && c.f?.real != null) L.push(["real", "Lo que pasó", `${usd(c.f.real)} el ${longDate(c.f.target)}`]);
    return L;
  }
  function updateTicket() {
    const dl = $("lines");
    const L = ticketLines();
    const keys = L.map((l) => l[0]);
    dl.querySelectorAll<HTMLElement>(".line").forEach((row) => {
      if (!keys.includes(row.dataset.k as string)) row.remove();
    });
    L.forEach(([k, label, v], i) => {
      let row = dl.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (!row) {
        row = document.createElement("div");
        row.className = "line";
        row.dataset.k = k;
        row.dataset.v = "\u0000";
        row.innerHTML = `<dt>${label}</dt><dd></dd>`;
        const next = keys
          .slice(i + 1)
          .map((n) => dl.querySelector(`[data-k="${n}"]`))
          .find(Boolean);
        dl.insertBefore(row, next ?? null);
      }
      (row.querySelector("dt") as HTMLElement).textContent = label;
      if (row.dataset.v !== v) {
        const was = row.dataset.v;
        row.dataset.v = v;
        const dd = document.createElement("dd");
        if (v) {
          dd.className = "num a-rise";
          dd.textContent = v;
        } else {
          dd.className = "hatch";
          dd.innerHTML = '<span class="sr">Pendiente</span>';
        }
        (row.querySelector("dd") as HTMLElement).replaceWith(dd);
        if (v && was !== "\u0000") restart(row, "flash");
      }
    });
    const c = ctx();
    $("orderNo").textContent = c.day ? orderNo(c.day.t) : "Nº —";
    let label = "Total";
    let t = 0;
    if (c.bbl && c.day) {
      if (c.dec === "fijar") {
        label = "Coste fijado";
        t = c.day.price * c.m;
      } else if (c.dec === "esperar" && c.f) {
        const real = c.isPast && S.closed && c.f.real != null;
        label = real ? "Coste real" : "Coste probable";
        t = (real ? (c.f.real as number) : c.f.p50) * c.m;
      } else {
        label = c.isPast ? "Ese día costaba" : "Hoy costaría";
        t = c.day.price * c.m;
      }
    }
    $("totalLabel").textContent = label;
    animateTotal(t);
  }
  let shown = 0;
  let target = 0;
  let raf = 0;
  function animateTotal(t: number) {
    const el = $("totalVal");
    if (t === target) return;
    target = t;
    cancelAnimationFrame(raf);
    if (!t) {
      shown = 0;
      el.textContent = "";
      el.className = "tk-tval num empty hatch";
      return;
    }
    el.className = "tk-tval num";
    if (reduced()) {
      shown = t;
      el.textContent = musd(t);
      return;
    }
    const from = shown;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 700);
      shown = from + (t - from) * (1 - (1 - k) ** 3);
      el.textContent = musd(shown);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ── flujo ──
  async function go(n: number) {
    const st = $("stage");
    st.classList.add("leave");
    await new Promise((r) => setTimeout(r, 170));
    if (steps()[n] === "decision" && S.mode === "hoy" && !today.h[HORIZONS[0].h]) {
      // La red de «Hoy» se ejecuta en segundo plano desde que se abre la página
      st.innerHTML = '<p class="lead">Calculando la franja con la red…</p>';
      st.classList.remove("leave");
      try {
        await ready;
      } catch (err) {
        st.innerHTML = `<p class="lead">${(err as Error).message}</p>`;
        S.busy = false;
        return;
      }
    }
    S.step = n;
    renderStage();
    st.classList.remove("leave");
    updateNav();
    S.busy = false;
  }
  function pick(field: Step, v: string, el: HTMLElement) {
    if (S.busy || S.closed) return;
    S.busy = true;
    el.parentElement?.querySelectorAll(".tile").forEach((t) => t.classList.toggle("on", t === el));
    S.picks[field] = v;
    updateTicket();
    if (field === "entrega") {
      const hz = document.getElementById("hz");
      if (hz) hz.dataset.sel = v;
    }
    if (field === "decision") setTimeout(closeOrder, 380);
    else setTimeout(() => void go(S.step + 1), field === "entrega" ? 650 : 440);
  }
  function back(i: number) {
    if (S.busy) return;
    S.busy = true;
    S.closed = false;
    delete S.picks.decision;
    $("stamp")?.remove();
    updateTicket();
    void go(i);
  }
  function reset(m: "hoy" | "pasado") {
    const changed = m !== S.mode;
    Object.assign(S, { mode: m, step: 0, picks: {}, closed: false });
    $("stamp")?.remove();
    if (changed) $("lines").innerHTML = "";
    renderModes();
    buildNav();
    renderStage();
    updateTicket();
  }
  function setMode(m: "hoy" | "pasado") {
    if (S.busy) return;
    S.busy = true;
    const st = $("stage");
    st.classList.add("leave");
    setTimeout(() => {
      reset(m);
      st.classList.remove("leave");
      S.busy = false;
    }, 170);
  }

  // ── portada → mesa ──
  function start(m: "hoy" | "pasado") {
    $("intro").hidden = true;
    $("desk").hidden = false;
    restart($("desk"), "a-rise");
    reset(m);
  }
  $("startHoy").addEventListener("click", () => start("hoy"));
  $("startPas").addEventListener("click", () => start("pasado"));

  $("stage").addEventListener("click", (e) => {
    const p = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pick]");
    if (p) {
      if (!p.disabled) pick(p.dataset.pick as Step, p.dataset.v as string, p);
      return;
    }
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!a) return;
    if (a.dataset.act === "again") setMode(S.mode);
    else setMode(S.mode === "pasado" ? "hoy" : "pasado");
  });
  $("stepBtns").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".stepbtn");
    if (b && !b.disabled) back(Number(b.dataset.step));
  });
  $("segHoy").addEventListener("click", () => S.mode !== "hoy" && setMode("hoy"));
  $("segPas").addEventListener("click", () => S.mode !== "pasado" && setMode("pasado"));

  // ── tema ──
  $("theme").addEventListener("click", (e) => {
    const next = isDark() ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("brent-theme", next);
      } catch {
        /* sin almacenamiento: el tema vale para esta visita */
      }
      ship.theme();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !reduced()) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      document.documentElement.style.setProperty("--vx", `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty("--vy", `${r.top + r.height / 2}px`);
      doc.startViewTransition(apply);
    } else apply();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => ship.theme());
}

init().catch((err: Error) => {
  $("intro").insertAdjacentHTML("beforeend", `<p class="lead">${err.message}</p>`);
});
