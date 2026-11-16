// Producto: previsión del Brent en una sola pantalla. A la izquierda, la escena 3D (precio real,
// previsión que se abre hasta la fecha objetivo y la gota de crudo); a la derecha, los controles.
// «Hoy» calcula la previsión en el navegador con los modelos ONNX de make export-web; «Un día pasado»
// usa las previsiones de test ya exportadas (quality.json) y deja revelar el precio que llegó después.
import * as ort from "onnxruntime-web/wasm";
import * as I from "./icons";
import { type Bundle, predict, type Row } from "./model";
import { type Quality, S } from "./sonda";
import { createStage, type StageData } from "./stage";
import "./product.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

interface Market {
  last: number;
  ts: string;
  history: { t: string; close: number }[];
  events: { t: string; label: string }[];
  rows: { t: string[]; values: Row[] };
}
interface Fc {
  lo: number;
  mid: number;
  hi: number;
}

// Plazos del enunciado; `spread` dibuja el icono (el abanico se abre más cuanto más lejos)
const HZ = [
  { h: 5, label: "1 semana", spread: 0.12 },
  { h: 63, label: "3 meses", spread: 0.5 },
  { h: 252, label: "1 año", spread: 1 },
];
// Días de pasado visibles en la escena según el plazo
const WINDOW: Record<number, number> = { 5: 70, 63: 330, 252: 1010 };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const money = (v: number) => `${S.fmt.num(v, 0)} $`;

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

// ── tema ─────────────────────────────────────────────────────
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

// ── cifra que rueda desde el valor que hay en pantalla ───────
const rolling = new WeakMap<HTMLElement, { v: number; raf: number }>();
function roll(el: HTMLElement, to: number) {
  const st = rolling.get(el) ?? { v: to, raf: 0 };
  cancelAnimationFrame(st.raf);
  const from = st.v;
  if (still || from === to) {
    st.v = to;
    el.textContent = S.fmt.num(to, 0);
    rolling.set(el, st);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / 900);
    const e = 1 - 2 ** (-10 * k);
    st.v = from + (to - from) * e;
    el.textContent = S.fmt.num(st.v, 0);
    if (k < 1) st.raf = requestAnimationFrame(step);
    else st.v = to;
  };
  st.raf = requestAnimationFrame(step);
  rolling.set(el, st);
}

// ── control segmentado con indicador que se desliza ──────────
function segmented<T extends string | number>(
  host: HTMLElement,
  items: { value: T; label: string; icon: string }[],
  onPick: (v: T) => void,
) {
  host.innerHTML =
    '<span class="seg-thumb" aria-hidden="true"></span>' +
    items
      .map((x) => `<button type="button" role="radio" data-v="${x.value}">${x.icon}<span>${x.label}</span></button>`)
      .join("");
  const thumb = host.querySelector<HTMLElement>(".seg-thumb") as HTMLElement;
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
  let sel: T | null = null;
  const set = (v: T) => {
    sel = v;
    buttons.forEach((b) => {
      const on = b.dataset.v === String(v);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) {
        thumb.style.width = `${b.offsetWidth}px`;
        thumb.style.transform = `translateX(${b.offsetLeft}px)`;
      }
    });
  };
  new ResizeObserver(() => sel !== null && set(sel)).observe(host);
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => onPick(items[i].value));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const j = (i + d + items.length) % items.length;
      onPick(items[j].value);
      buttons[j].focus();
    });
  });
  return set;
}

async function init() {
  const stage = createStage($("stage"));
  $("study").innerHTML = `${I.book}<span>Cómo se hizo</span>`;
  $("theme").innerHTML = I.theme;

  const [mk, quality] = await Promise.all([
    loadJson<Market>("data/market.json"),
    loadJson<Quality[]>("data/quality.json"),
  ]);
  const hist = mk.history;
  const N = hist.length;
  const idxOf = new Map(hist.map((p, i) => [p.t, i]));

  // Previsiones de test por plazo: la fecha `t` es la fecha objetivo; se partió h días hábiles antes
  const bt = new Map<number, Map<string, Fc>>();
  const origins = new Map<number, number[]>();
  for (const q of quality) {
    const m = new Map<string, Fc>();
    const os: number[] = [];
    for (const p of q.backtest) {
      m.set(p.t, { lo: p.lo80, mid: p.pred, hi: p.hi80 });
      const i = idxOf.get(p.t);
      if (i !== undefined && i - q.horizon >= 0) os.push(i - q.horizon);
    }
    bt.set(q.horizon, m);
    origins.set(
      q.horizon,
      os.sort((a, b) => a - b),
    );
  }

  // Estado
  let h = 5;
  let mode: "now" | "past" = "now";
  let origin = (() => {
    const os = origins.get(5) ?? [];
    return os[Math.floor(os.length * 0.62)] ?? N - 1;
  })();
  let predicted = false;
  let revealed = false;
  const today = new Map<number, Fc>();
  let modelsReady = false;

  // ── controles ──
  const setH = segmented(
    $("horizon"),
    HZ.map((x) => ({ value: x.h, label: x.label, icon: I.fan(x.spread) })),
    (v) => {
      h = v;
      clampOrigin();
      render();
    },
  );
  const setMode = segmented(
    $("mode"),
    [
      { value: "now" as const, label: "Hoy", icon: I.now },
      { value: "past" as const, label: "Un día pasado", icon: I.past },
    ],
    (v) => {
      if (v === mode) return;
      mode = v;
      revealed = false;
      $("mode").dataset.mode = v;
      render();
    },
  );

  function clampOrigin() {
    const os = origins.get(h) ?? [];
    if (!os.length || os.includes(origin)) return;
    // el día válido más cercano al elegido
    origin = os.reduce((a, b) => (Math.abs(b - origin) < Math.abs(a - origin) ? b : a));
  }

  // Deslizador: el periodo de test entero, con su perfil de precio detrás
  const scrub = $("scrub");
  function renderScrub() {
    const os = origins.get(h) ?? [];
    const a = os[0] ?? 0;
    const b = os[os.length - 1] ?? N - 1;
    const seg = hist.slice(a, b + 1).map((p) => p.close);
    const mn = Math.min(...seg);
    const mx = Math.max(...seg);
    const pts = seg
      .map((v, i) => `${((i / (seg.length - 1)) * 100).toFixed(2)},${(38 - ((v - mn) / (mx - mn)) * 34).toFixed(2)}`)
      .join(" ");
    const k = os.indexOf(origin);
    scrub.innerHTML = `<div class="scrub-track">
        <svg class="scrub-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>
        <input type="range" min="0" max="${os.length - 1}" value="${k}" aria-label="Día desde el que se prevé" />
        <output class="scrub-bubble"></output>
      </div>`;
    const input = scrub.querySelector("input") as HTMLInputElement;
    const bubble = scrub.querySelector("output") as HTMLOutputElement;
    const place = () => {
      const f = Number(input.value) / Math.max(1, os.length - 1);
      bubble.textContent = S.fmt.longDate(hist[origin].t);
      scrub.style.setProperty("--f", f.toFixed(4));
    };
    input.addEventListener("input", () => {
      origin = os[Number(input.value)];
      revealed = false;
      place();
      render(false);
    });
    place();
  }

  // ── resultado ──
  const result = $("result");
  result.innerHTML = `
    <div class="r-top">
      <div class="r-big"><span class="r-num" id="num">${S.fmt.num(mk.last, 0)}</span><span class="r-unit">$</span></div>
      <div class="r-meta">
        <span class="chip" id="chg"></span>
        <span class="r-date" id="when">${I.calendar}<span></span></span>
      </div>
    </div>
    <div class="range" id="range">
      <div class="range-track"><i class="range-band"></i><i class="range-now"></i><i class="range-mid"></i><i class="range-real"></i></div>
      <div class="range-ends"><span class="range-lo"></span><span class="range-hi"></span></div>
    </div>
    <div class="real" id="real">
      <span class="real-l">${I.eye}<span>Precio real</span></span>
      <b class="real-v" id="realv"></b>
      <span class="badge" id="hit"></span>
    </div>`;

  // ── acciones ──
  const actions = $("actions");
  actions.innerHTML = `
    <button type="button" class="btn btn-primary" id="go">${I.drop}<span>Prever</span></button>
    <button type="button" class="btn btn-secondary" id="reveal">${I.eye}<span>Revelar precio real</span></button>`;
  const go = $("go") as HTMLButtonElement;
  const rev = $("reveal") as HTMLButtonElement;
  const fire = (btn: HTMLElement) => {
    btn.classList.remove("is-firing");
    void btn.offsetWidth;
    btn.classList.add("is-firing");
  };
  go.addEventListener("click", () => {
    if (go.disabled) return;
    fire(go);
    if (predicted) {
      // Repetir: el volumen se recoge y vuelve a abrirse con la gota
      predicted = false;
      revealed = false;
      render(false);
      window.setTimeout(() => {
        predicted = true;
        render(false);
      }, 420);
      return;
    }
    predicted = true;
    render(false);
  });
  rev.addEventListener("click", () => {
    if (rev.disabled) return;
    fire(rev);
    revealed = true;
    render(false);
  });

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
      stage.theme();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !still) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      document.documentElement.style.setProperty("--vx", `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty("--vy", `${r.top + r.height / 2}px`);
      doc.startViewTransition(apply);
    } else apply();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => stage.theme());

  // ── pintado ──
  function current() {
    if (mode === "now") {
      return { o: N - 1, target: S.tradingDays(mk.ts, h)[h - 1], fc: today.get(h) ?? null, future: [] as number[] };
    }
    const tIdx = origin + h;
    return {
      o: origin,
      target: hist[tIdx].t,
      fc: bt.get(h)?.get(hist[tIdx].t) ?? null,
      future: hist.slice(origin + 1, tIdx + 1).map((p) => p.close),
    };
  }

  function render(rebuildScrub = true) {
    setH(h);
    setMode(mode);
    scrub.hidden = mode !== "past";
    if (mode === "past" && rebuildScrub) renderScrub();

    const c = current();
    const from = Math.max(0, c.o - WINDOW[h]);
    const vis = hist.slice(from, c.o + 1);
    const start = hist[c.o].close;
    const show = predicted && !!c.fc;
    const data: StageData = {
      t: vis.map((p) => p.t),
      v: vis.map((p) => p.close),
      future: c.future,
      h,
      target: c.target,
      fc: show ? c.fc : null,
      revealed: show && revealed,
      events: mk.events,
      fmt: money,
      fmtDate: S.fmt.day,
    };
    stage.set(data);

    // Cifra: parte del precio del día de partida y rueda hasta la previsión
    roll($("num"), show && c.fc ? c.fc.mid : start);
    const chg = $("chg");
    const when = $("when").querySelector("span") as HTMLElement;
    if (show && c.fc) {
      const r = c.fc.mid / start - 1;
      chg.className = `chip ${r >= 0 ? "is-up" : "is-down"}`;
      chg.innerHTML = `${I.trend(r >= 0)}<span>${r >= 0 ? "+" : "−"}${S.fmt.num(Math.abs(r) * 100, Math.abs(r) < 0.1 ? 1 : 0)} %</span>`;
      when.textContent = S.fmt.longDate(c.target);
    } else {
      chg.className = "chip is-idle";
      chg.innerHTML = `${I.now}<span>${mode === "now" ? "Hoy" : "Ese día"}</span>`;
      when.textContent = S.fmt.longDate(hist[c.o].t);
    }

    // Rango del 80 %: banda sobre una escala que incluye el precio de partida y el real
    const range = $("range");
    const real = c.future.length ? c.future[c.future.length - 1] : null;
    if (c.fc) {
      const vals = [c.fc.lo, c.fc.hi, start].concat(real !== null && revealed ? [real] : []);
      let mn = Math.min(...vals);
      let mx = Math.max(...vals);
      const pad = (mx - mn) * 0.08;
      mn -= pad;
      mx += pad;
      const x = (v: number) => `${(((v - mn) / (mx - mn)) * 100).toFixed(2)}%`;
      range.style.setProperty("--now", x(start));
      range.style.setProperty("--lo", show ? x(c.fc.lo) : x(start));
      range.style.setProperty("--hi", show ? x(c.fc.hi) : x(start));
      range.style.setProperty("--mid", show ? x(c.fc.mid) : x(start));
      if (real !== null) range.style.setProperty("--real", x(real));
      (range.querySelector(".range-lo") as HTMLElement).textContent = money(c.fc.lo);
      (range.querySelector(".range-hi") as HTMLElement).textContent = money(c.fc.hi);
    }
    range.classList.toggle("is-open", show);
    range.classList.toggle("is-revealed", show && revealed && real !== null);

    // Precio real (Un día pasado, tras revelar)
    const on = mode === "past" && show && revealed && real !== null && !!c.fc;
    $("real").classList.toggle("is-on", on);
    if (on && c.fc && real !== null) {
      $("realv").textContent = money(real);
      const inside = real >= c.fc.lo && real <= c.fc.hi;
      const hit = $("hit");
      hit.className = `badge ${inside ? "is-in" : "is-out"}`;
      hit.innerHTML = `${inside ? I.check : I.cross}<span>${inside ? "Dentro del rango" : "Fuera del rango"}</span>`;
    }

    // Botones
    go.disabled = mode === "now" && !modelsReady;
    go.classList.toggle("is-loading", go.disabled);
    (go.querySelector("span") as HTMLElement).textContent = go.disabled
      ? "Cargando la red"
      : predicted
        ? "Prever otra vez"
        : "Prever";
    rev.hidden = mode !== "past";
    rev.disabled = !show || revealed;

    // Fiabilidad en una línea, con enlace al estudio
    const q = quality.find((x) => x.horizon === h);
    if (q) {
      const gap = q.metrics.mae / q.baseline.mae - 1;
      const how =
        Math.abs(gap) < 0.02
          ? "falla lo mismo que decir «seguirá igual»"
          : `falla un ${S.fmt.num(Math.abs(gap) * 100, 0)} % ${gap > 0 ? "más" : "menos"} que decir «seguirá igual»`;
      $("verdict").innerHTML =
        `${I.scale}<span>De ${q.period[0].slice(0, 4)} a ${q.period[1].slice(0, 4)}, ${how}</span>${I.arrow}`;
    }
  }

  render();
  requestAnimationFrame(() => document.body.classList.add("is-in"));

  // Modelos de «Hoy»: se cargan en segundo plano; mientras, «Un día pasado» ya funciona
  const bundle = await loadJson<Bundle>("model/manifest.json");
  for (const m of bundle.models) {
    if (!HZ.some((x) => x.h === m.horizon)) continue;
    const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
    const [lo, mid, hi] = await predict(ort, session, m, mk.rows.values);
    today.set(m.horizon as number, { lo, mid, hi });
  }
  modelsReady = true;
  render(false);
}

init().catch((err: Error) => {
  $("result").innerHTML = `<p class="error">${err.message}</p>`;
});
