// Mesa de compras del Brent: una empresa elige carga, entrega y decisión, y la orden de compra de la
// derecha se rellena con cada clic. «Hoy» calcula p10, p50 y p90 en el navegador con los modelos ONNX
// de make export-web sobre las últimas filas de market.json; «En el pasado» usa las previsiones de test
// (quality.json, fuera de muestra) de días clave de 2023–2026 y revela el precio que llegó después.
import * as ort from "onnxruntime-web/wasm";
import {
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
  SHIPS,
  shortDate,
  type TestQuality,
  tenFutures,
  tradingDayAfter,
  usd,
  verdict,
} from "./desk";
import * as I from "./icons";
import { type Bundle, predict, type Row } from "./model";
import { createShip, type Ship } from "./ship";
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

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const restart = (el: HTMLElement, cls: string) => {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};
const STEP_NAMES: Record<Step, string> = { dia: "El día", carga: "La carga", entrega: "La entrega", decision: "La decisión" };
const STEP_SHORT: Record<Step, string> = { dia: "Día", carga: "Carga", entrega: "Entrega", decision: "Decisión" };

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

async function init() {
  $("theme").innerHTML = I.theme;
  const [mk, quality] = await Promise.all([
    loadJson<Market>("data/market.json"),
    loadJson<TestQuality[]>("data/quality.json"),
  ]);
  const qOf = (h: number) => quality.find((q) => q.horizon === h);
  const testYears = (() => {
    const q = qOf(5) ?? quality[0];
    return `${q.period[0].slice(0, 4)}–${q.period[1].slice(2, 4)}`;
  })();

  // «Hoy»: precio de partida y fechas de entrega; p10–p90 llegan cuando la red termina en el navegador
  const today: Day = {
    id: "hoy",
    t: mk.ts,
    price: mk.last,
    title: "Hoy",
    h: Object.fromEntries(HORIZONS.map((x) => [x.h, null])),
  };
  const targets = Object.fromEntries(HORIZONS.map((x) => [x.h, tradingDayAfter(mk.ts, x.h)]));
  const ready = (async () => {
    const bundle = await loadJson<Bundle>("model/manifest.json");
    for (const x of HORIZONS) {
      const m = bundle.models.find((mm) => mm.horizon === x.h);
      if (!m) throw new Error(`Falta el modelo de ${x.h} días en manifest.json.`);
      const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
      const [p10, p50, p90] = await predict(ort, session, m, mk.rows.values);
      today.h[x.h] = { p10, p50, p90, target: targets[x.h] };
    }
  })();
  ready.catch(() => undefined);

  // «En el pasado»: días clave del periodo de test
  const past: Day[] = keyDays(mk.history, quality, mk.events).map((d: KeyDay) => ({
    id: d.t,
    t: d.t,
    price: d.price,
    title: d.title,
    h: d.h,
  }));

  // Pie: una línea con la comparación frente a la persistencia en test y enlace al estudio
  const beaten = HORIZONS.filter((x) => {
    const q = qOf(x.h);
    return q && q.metrics.mae < q.baseline.mae;
  }).length;
  $("verdict").textContent =
    beaten === 0
      ? `En test (${testYears}), la cifra central falló más que «el precio de hoy» en los tres plazos; la orden se apoya en la franja.`
      : `En test (${testYears}), la cifra central de la red falló menos que «el precio de hoy» en ${beaten} de los tres plazos.`;

  // ── estado ──
  const S = {
    mode: "hoy" as "hoy" | "pasado",
    step: 0,
    picks: {} as Partial<Record<Step, string>>,
    closed: false,
    busy: false,
  };
  let ship: Ship | null = null;

  const steps = (): Step[] => (S.mode === "pasado" ? ["dia", "carga", "entrega", "decision"] : ["carga", "entrega", "decision"]);
  function ctx() {
    const isPast = S.mode === "pasado";
    const day = isPast ? (past.find((d) => d.id === S.picks.dia) ?? null) : today;
    const sh = SHIPS.find((x) => x.id === S.picks.carga) ?? null;
    const hz = HORIZONS.find((x) => String(x.h) === S.picks.entrega) ?? null;
    const f = day && hz ? day.h[hz.h] : null;
    const target = hz ? (isPast ? (f?.target ?? null) : targets[hz.h]) : null;
    return { isPast, day, ship: sh, hz, f, target, dec: (S.picks.decision ?? null) as Decision | null, m: sh ? sh.bbl / 1e6 : 0 };
  }

  // ── cabecera ──
  const segInd = $("segInd");
  function renderHeader(swap: boolean) {
    const c = ctx();
    segInd.classList.toggle("right", c.isPast);
    for (const [id, on] of [
      ["segHoy", !c.isPast],
      ["segPas", c.isPast],
    ] as const) {
      $(id).classList.toggle("on", on);
      $(id).setAttribute("aria-pressed", String(on));
    }
    $("ticker").textContent = c.isPast
      ? c.day
        ? `Brent ${usd(c.day.price)} el ${longDate(c.day.t)}`
        : ""
      : `Brent ${usd(mk.last)} el ${shortDate(mk.ts)}`;
    if (swap) {
      const h = $("headline");
      h.textContent = c.isPast ? "Mesa de compras, días pasados" : "Mesa de compras del Brent";
      restart(h, "a-rise");
    }
  }

  // ── pasos ──
  function buildNav() {
    $("stepBtns").innerHTML = steps()
      .map(
        (k, i) =>
          `<button type="button" class="stepbtn" data-step="${i}"><span class="mark" aria-hidden="true"></span><span class="num">${i + 1}</span><span>${STEP_SHORT[k]}</span></button>`,
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

  // ── escenario ──
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
  const tilesCarga = () =>
    SHIPS.map((x, i) =>
      tile("carga", x.id, i, `<span class="t-name">${x.name}</span><span class="t-sub num">${nf(x.bbl)} barriles</span>`),
    ).join("");
  const tilesEntrega = (c: ReturnType<typeof ctx>) =>
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

  function rulerData(c: ReturnType<typeof ctx>) {
    const f = c.f as DayFc;
    const p0 = (c.day as Day).price;
    const qs = tenFutures(f);
    const vals = [p0, ...qs, f.p10, f.p90];
    if (c.isPast && f.real != null) vals.push(f.real);
    const sc = rulerScale(vals);
    const pos = (v: number) => ((v - sc.lo) / (sc.hi - sc.lo)) * 100;
    const at = (v: number) => {
      const x = pos(v);
      const t = x < 18 ? "translateX(-10px)" : x > 82 ? "translateX(calc(-100% + 10px))" : "translateX(-50%)";
      return `left:${x}%;transform:${t}`;
    };
    return { f, p0, qs, ...sc, pos, at };
  }
  function rulerHTML(c: ReturnType<typeof ctx>) {
    const R = rulerData(c);
    const f = R.f;
    let ticks = "";
    let labs = "";
    for (let v = R.lo, i = 0; v <= R.hi + 1e-9; v += R.step / 2, i++) {
      const major = i % 2 === 0;
      ticks += `<div class="r-tick" style="left:${R.pos(v)}%;height:${major ? 14 : 7}px"></div>`;
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
      <p class="rcap">10 futuros posibles. 8 caen en la franja.</p>
      <div class="ruler" id="ruler" role="img" aria-label="${aria}">
        <div class="r-today-l num" style="${R.at(R.p0)}">${start}</div>
        <div class="r-today" style="left:${R.pos(R.p0)}%"></div>
        ${dots}
        <div class="r-band a-band" style="left:${R.pos(f.p10)}%;width:${R.pos(f.p90) - R.pos(f.p10)}%"></div>
        <div class="r-med a-band" style="left:${R.pos(f.p50)}%"></div>
        <div class="r-axis"></div>
        ${ticks}${labs}
        <div class="r-med-l num a-band" style="${R.at(f.p50)}">Lo probable ${usd(f.p50)}</div>
      </div></div>`;
  }
  function decisionHTML(c: ReturnType<typeof ctx>) {
    const f = c.f as DayFc;
    const p0 = (c.day as Day).price;
    return `<div class="grid cols-240" id="decTiles">
      <button type="button" class="tile a-rise" data-pick="decision" data-v="fijar" style="animation-delay:420ms">
        <span class="t-dlabel">${c.isPast ? "Fijar el precio ese día" : "Fijar el precio hoy"}</span>
        <span class="t-dcost num">${musd(p0 * c.m)}</span>
        <span class="t-sub">Pagas esto pase lo que pase.</span></button>
      <button type="button" class="tile a-rise" data-pick="decision" data-v="esperar" style="animation-delay:470ms">
        <span class="t-dlabel">Esperar a la entrega</span>
        <span class="t-dcost num">${musd(f.p50 * c.m)}</span>
        <span class="t-sub num">Lo probable; hasta ${musd(f.p90 * c.m)}.</span></button>
    </div>`;
  }

  function renderStage() {
    const c = ctx();
    const cur = steps()[S.step];
    const st = $("stage");
    const h2 = `<h2 class="h2">${STEP_NAMES[cur]}</h2>`;
    if (cur === "dia") st.innerHTML = `<div class="block a-enter">${h2}<div class="grid cols-200">${tilesDia()}</div></div>`;
    else if (cur === "carga") {
      st.innerHTML = `<div class="block a-enter">${h2}<div class="shipslot" id="shipSlot"></div><div class="grid cols-180" id="cargaTiles">${tilesCarga()}</div></div>`;
      if (!ship) ship = createShip();
      $("shipSlot").appendChild(ship.el);
      const picked = SHIPS.find((x) => x.id === S.picks.carga);
      ship.size(picked?.length ?? SHIPS[1].length);
      ship.load(!!picked);
    } else if (cur === "entrega") st.innerHTML = `<div class="block a-enter">${h2}<div class="grid cols-180">${tilesEntrega(c)}</div></div>`;
    else
      st.innerHTML = `<div class="block a-enter" id="decBlock"><div id="decHead">${h2}</div>${rulerHTML(c)}${decisionHTML(c)}</div>`;
  }

  // Vista previa del tamaño al pasar por una tarjeta de carga (o al enfocarla con el teclado)
  const preview = (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-pick="carga"]');
    if (!ship || S.busy) return;
    const picked = SHIPS.find((x) => x.id === S.picks.carga);
    const over = t ? SHIPS.find((x) => x.id === t.dataset.v) : null;
    ship.size((over ?? picked ?? SHIPS[1]).length);
  };
  $("stage").addEventListener("pointerover", preview);
  $("stage").addEventListener("focusin", preview);
  $("stage").addEventListener("pointerleave", preview);

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
      title = verdict(c.dec as Decision, day.price, real, (c.ship as (typeof SHIPS)[number]).bbl);
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
    L.push(["carga", "Carga", c.ship ? `${c.ship.name}, ${nf(c.ship.bbl)} barriles` : ""]);
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
    if (c.ship && c.day) {
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
    const wait = new Promise((r) => setTimeout(r, 170));
    if (steps()[n] === "decision" && S.mode === "hoy") {
      // La red de «Hoy» se ejecuta en segundo plano desde que se abre la página
      await wait;
      if (!today.h[HORIZONS[0].h]) {
        st.innerHTML = '<p class="lead">Calculando la franja con la red…</p>';
        st.classList.remove("leave");
      }
      try {
        await ready;
      } catch (err) {
        st.innerHTML = `<p class="lead">${(err as Error).message}</p>`;
        st.classList.remove("leave");
        S.busy = false;
        return;
      }
    } else await wait;
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
    if (field === "dia") renderHeader(false);
    if (field === "carga" && ship) {
      const sh = SHIPS.find((x) => x.id === v) ?? SHIPS[1];
      ship.size(sh.length);
      ship.load(true);
    }
    if (field === "decision") setTimeout(closeOrder, 380);
    else setTimeout(() => void go(S.step + 1), field === "carga" && !reduced() ? 1300 : 440);
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
  function setMode(m: "hoy" | "pasado") {
    if (S.busy) return;
    S.busy = true;
    const changed = m !== S.mode;
    const st = $("stage");
    st.classList.add("leave");
    setTimeout(() => {
      Object.assign(S, { mode: m, step: 0, picks: {}, closed: false });
      $("stamp")?.remove();
      if (changed) $("lines").innerHTML = "";
      renderHeader(changed);
      buildNav();
      renderStage();
      updateTicket();
      st.classList.remove("leave");
      S.busy = false;
    }, 170);
  }

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
      ship?.theme();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !reduced()) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      document.documentElement.style.setProperty("--vx", `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty("--vy", `${r.top + r.height / 2}px`);
      doc.startViewTransition(apply);
    } else apply();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => ship?.theme());

  renderHeader(false);
  buildNav();
  renderStage();
  updateTicket();
}

init().catch((err: Error) => {
  $("stage").innerHTML = `<p class="lead">${err.message}</p>`;
});
