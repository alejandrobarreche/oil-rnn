// El Brent a cuatro plazos. Cuatro planos, uno por red (5, 21, 63 y 252 días hábiles), con la misma
// serie real de los últimos seis meses. Las redes ONNX de make export-web calculan p10, p50 y p90 en el
// navegador sobre las últimas filas de market.json; al pulsar, los planos se separan y cada uno abre su
// franja. Cada fila compara la cobertura de test de la red con la de la persistencia (quality.json).
import * as ort from "onnxruntime-web/wasm";
import {
  coverage,
  type Fc,
  HORIZONS,
  longDate,
  nf,
  type PricePoint,
  priceScale,
  type TestQuality,
  tradingDayAfter,
  usd,
} from "./forecast";
import * as I from "./icons";
import { type Bundle, type Manifest, predict, type Row } from "./model";
import "./product.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

interface Market {
  last: number;
  ts: string;
  history: PricePoint[];
  rows: { t: string[]; values: Row[] };
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAST = 126; // días hábiles de historia en cada plano
const W = 300; // viewBox de cada plano
const H = 150;
const CELL: Record<string, string> = { rnn: "RNN", lstm: "LSTM", gru: "GRU" };

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

async function init() {
  document.querySelector(".study")?.insertAdjacentHTML("beforeend", I.arrow);
  const [mk, quality, bundle] = await Promise.all([
    loadJson<Market>("data/market.json"),
    loadJson<TestQuality[]>("data/quality.json"),
    loadJson<Bundle>("model/manifest.json"),
  ]);
  const spec = (h: number) => bundle.models.find((m) => m.horizon === h) as Manifest | undefined;
  $("live").innerHTML = `Brent <b>${usd(mk.last)}</b> el ${longDate(mk.ts)}`;
  $("source").textContent = `Datos diarios de la EIA y FRED hasta el ${longDate(mk.ts)}`;
  const hist = mk.history.slice(-PAST - 1);
  const fcs: Record<number, Fc> = {};

  // Las cuatro redes se ejecutan en segundo plano desde que se abre la página
  const ready = (async () => {
    for (const x of HORIZONS) {
      const m = spec(x.h);
      if (!m) throw new Error(`Falta el modelo de ${x.h} días en manifest.json.`);
      const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
      const [p10, p50, p90] = await predict(ort, session, m, mk.rows.values);
      fcs[x.h] = { p10, p50, p90 };
    }
    renderStack();
  })();
  ready.catch(() => undefined);

  // ── planos ──
  function renderStack() {
    const all = Object.values(fcs);
    const sc = priceScale([...hist.map((p) => p.close), ...all.flatMap((f) => [f.p10, f.p90])]);
    const x = (d: number) => 10 + ((d + PAST) / (PAST + 252)) * (W - 20);
    const y = (v: number) => H - 10 - ((v - sc.lo) / (sc.hi - sc.lo)) * (H - 20);
    const line = hist.map((p, i) => `${x(i - PAST).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
    const x0 = x(0);
    const y0 = y(mk.last);
    $("stack").innerHTML =
      HORIZONS.map((hz, i) => {
        const f = fcs[hz.h];
        const m = spec(hz.h);
        const xh = x(hz.h);
        const fan = f
          ? `<g class="fan" style="transform-origin:${x0}px ${y0}px;transition-delay:${520 + i * 110}ms">
              <polygon points="${x0},${y0} ${xh},${y(f.p90)} ${xh},${y(f.p10)}"/>
              <line x1="${x0}" y1="${y0}" x2="${xh}" y2="${y(f.p50)}"/></g>`
          : "";
        return `<div class="layer" data-h="${hz.h}" style="--i:${i}">
          <span class="layer-lab"><b>${hz.label}</b>${m?.cell ? `<span>${CELL[m.cell]}</span>` : ""}</span>
          <div class="plane">
            <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
              <line class="now" x1="${x0}" y1="6" x2="${x0}" y2="${H - 6}"/>
              <line class="mark" x1="${xh}" y1="${H - 16}" x2="${xh}" y2="${H - 6}"/>
              <polyline class="hist" points="${line}"/>
              ${fan}
            </svg>
            <i class="pin" style="left:${(xh / W) * 100}%;top:${(f ? y(f.p50) / H : 0.5) * 100}%"></i>
            <i class="pin0" style="left:${(x0 / W) * 100}%;top:${(y0 / H) * 100}%"></i>
          </div>
          ${f ? `<span class="chip num">${nf(f.p10)}–${nf(f.p90)} $</span>` : ""}
        </div>`;
      }).join("") +
      `<svg class="thread" aria-hidden="true"><line id="thread"/></svg><span class="chip chip0 num" id="chip0">Hoy ${usd(mk.last)}</span>`;
    placeChips();
  }

  // Los chips no giran con el plano: se colocan en la proyección de su punto en pantalla
  function placeChips() {
    const stack = $("stack");
    const sr = stack.getBoundingClientRect();
    stack.querySelectorAll<HTMLElement>(".layer").forEach((layer) => {
      const chip = layer.querySelector<HTMLElement>(".chip");
      const pin = layer.querySelector<HTMLElement>(".pin");
      if (!chip || !pin) return;
      const lr = layer.getBoundingClientRect();
      const pr = pin.getBoundingClientRect();
      chip.style.left = `${pr.left - lr.left + 12}px`;
      chip.style.top = `${pr.top - lr.top}px`;
    });
    // Hilo discontinuo por el punto de hoy de cada plano: la misma entrada para las cuatro redes
    const p0 = [...stack.querySelectorAll<HTMLElement>(".pin0")].map((p) => p.getBoundingClientRect());
    const t = document.getElementById("thread");
    if (!t || p0.length < 2) return;
    const [a, b] = [p0[0], p0[p0.length - 1]];
    t.setAttribute("x1", String(a.left - sr.left));
    t.setAttribute("y1", String(a.top - sr.top));
    t.setAttribute("x2", String(b.left - sr.left));
    t.setAttribute("y2", String(b.top - sr.top));
    const c = $("chip0");
    c.style.left = `${a.left - sr.left}px`;
    c.style.top = `${a.top - sr.top}px`;
  }
  // Sigue la separación de los planos fotograma a fotograma mientras dura
  function trackChips(ms: number) {
    const end = performance.now() + ms;
    const tick = () => {
      placeChips();
      if (performance.now() < end) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  window.addEventListener("resize", placeChips);
  renderStack();

  // ── filas ──
  function rowsHTML() {
    const head = `<li class="row head" aria-hidden="true"><span>Plazo</span><span>Lo probable</span><span>8 de cada 10</span></li>`;
    return (
      head +
      HORIZONS.map((hz) => {
        const f = fcs[hz.h];
        const q = quality.find((qq) => qq.horizon === hz.h);
        const cv = q ? coverage(q) : null;
        return `<li class="row" data-h="${hz.h}" tabindex="0">
          <span class="r-when"><b>${hz.label}</b><span class="num">${longDate(tradingDayAfter(mk.ts, hz.h))}</span></span>
          <span class="r-p50 num">${usd(f.p50)}</span>
          <span class="r-rng num">${nf(f.p10)}–${nf(f.p90)} $</span>
          ${cv ? `<span class="r-q num">En test, la franja acierta ${cv.net} de 100; la de la persistencia, ${cv.base}</span>` : ""}
        </li>`;
      }).join("")
    );
  }

  // ── un clic: separar los planos y abrir las franjas ──
  $("run").addEventListener("click", async () => {
    const btn = $<HTMLButtonElement>("run");
    btn.disabled = true;
    btn.textContent = "Calculando…";
    try {
      await ready;
    } catch (err) {
      $("lead").textContent = (err as Error).message;
      return;
    }
    $("rows").innerHTML = rowsHTML();
    $("actions").hidden = true;
    $("rows").hidden = false;
    $("stack").dataset.open = "true";
    trackChips(reduced() ? 0 : 1400);
  });

  // Resalta a la vez el plano y la fila que se señalan o se enfocan
  const select = (h: string) => {
    $("stack").dataset.sel = h;
    $("rows").dataset.sel = h;
  };
  for (const id of ["stack", "rows"]) {
    $(id).addEventListener("pointerover", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-h]");
      select(t?.dataset.h ?? "");
    });
    $(id).addEventListener("pointerleave", () => select(""));
  }
  $("rows").addEventListener("focusin", (e) => select((e.target as HTMLElement).dataset.h ?? ""));
  $("rows").addEventListener("focusout", () => select(""));
}

init().catch((err: Error) => {
  $("lead").textContent = err.message;
});
