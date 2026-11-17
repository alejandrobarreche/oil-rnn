// El Brent a cuatro plazos. Un gráfico con la serie real del Brent y, a la derecha de hoy, el tramo
// futuro con un hueco por plazo (5, 21, 63 y 252 días hábiles). Antes de prever, una ventana recorre la
// serie: es lo que lee cada red. Al pulsar, la ventana se fija en los últimos días y las cuatro redes ONNX
// (make export-web, calculadas en el navegador sobre market.json) abren su franja p10–p90, plazo a plazo.
// La barra de herramientas trata la serie: rango, escala, medias móviles, sucesos y previsiones de test
// (quality.json) del plazo elegido, junto a la persistencia.
import * as ort from "onnxruntime-web/wasm";
import {
  coverage,
  downsample,
  type Fc,
  futurePos,
  HORIZONS,
  longDate,
  type MarketEventLite,
  nf,
  niceTicks,
  pct,
  type PricePoint,
  priceScale,
  RANGES,
  sma,
  type TestQuality,
  tradingDayAfter,
  usd,
} from "./forecast";
import { type Drop, mountDrop } from "./drop";
import * as I from "./icons";
import { type Bundle, type Manifest, predict, type Row } from "./model";
import "./product.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

interface Market {
  last: number;
  ts: string;
  history: PricePoint[];
  events: MarketEventLite[];
  rows: { t: string[]; values: Row[] };
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CELL: Record<string, string> = { rnn: "RNN", lstm: "LSTM", gru: "GRU" };
const SHORT: Record<number, string> = { 5: "1 sem", 21: "1 mes", 63: "3 m", 252: "1 año" };
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

const S = {
  range: "1A" as (typeof RANGES)[number]["k"],
  log: false,
  ma50: false,
  ma200: false,
  events: false,
  test: false,
  sel: 21,
  open: false,
  draw: true, // la serie se dibuja al entrar
  reveal: false, // las franjas se abren al prever
};

async function init() {
  document.querySelector(".study")?.insertAdjacentHTML("beforeend", I.arrow);
  const [mk, quality, bundle] = await Promise.all([
    loadJson<Market>("data/market.json"),
    loadJson<TestQuality[]>("data/quality.json"),
    loadJson<Bundle>("model/manifest.json"),
  ]);
  const spec = (h: number) => bundle.models.find((m) => m.horizon === h) as Manifest | undefined;
  const qOf = (h: number) => quality.find((q) => q.horizon === h);
  const closes = mk.history.map((p) => p.close);
  const ma = { 50: sma(closes, 50), 200: sma(closes, 200) };
  const idx = new Map(mk.history.map((p, i) => [p.t, i]));
  const testYears = (() => {
    const q = qOf(5) ?? quality[0];
    return `${q.period[0].slice(0, 4)}–${q.period[1].slice(2, 4)}`;
  })();
  $("live").innerHTML = `Brent <b>${usd(mk.last)}</b> el ${longDate(mk.ts)}`;
  $("source").textContent = `Datos diarios de la EIA y FRED hasta el ${longDate(mk.ts)}`;
  const fcs: Record<number, Fc> = {};
  // La gota se agita según la anchura de la franja del plazo elegido
  let drop: Drop | null = null;
  const agitate = () => {
    const f = fcs[S.sel];
    if (drop && S.open && f) drop.agitate((f.p90 - f.p10) / f.p50);
  };
  mountDrop($("drop"))
    .then((d) => {
      drop = d;
      agitate();
    })
    .catch(() => $("drop").remove());

  // Las cuatro redes se ejecutan en segundo plano desde que se abre la página
  const ready = (async () => {
    for (const x of HORIZONS) {
      const m = spec(x.h);
      if (!m) throw new Error(`Falta el modelo de ${x.h} días en manifest.json.`);
      const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
      const [p10, p50, p90] = await predict(ort, session, m, mk.rows.values);
      fcs[x.h] = { p10, p50, p90 };
    }
  })();
  ready.catch(() => undefined);

  // ── gráfico ──
  function render() {
    const box = $("chart");
    const W = box.clientWidth;
    const H = box.clientHeight;
    if (W < 50 || H < 50) return;
    const narrow = W < 560;
    const m = { l: 6, r: narrow ? 40 : 50, t: 34, b: 52 };
    const xT = m.l + (W - m.l - m.r) * (narrow ? 0.4 : 0.6); // hoy
    const xEnd = W - m.r;
    const n = Math.min(mk.history.length - 1, RANGES.find((r) => r.k === S.range)?.n ?? 252);
    const i0 = mk.history.length - 1 - n;
    // Rangos largos: medias por bloques (semana en 5A, mes en Todo) para una línea más suave
    const b = Math.max(1, Math.round(n / 300));
    const line = downsample(closes.slice(i0), b).map((p) => ({ i: p.i + i0, v: p.v }));
    const xi = (i: number) => m.l + ((i - i0) / n) * (xT - m.l); // i: índice en la serie completa
    const xf = (h: number) => xT + (futurePos(h) - 0.05) * (xEnd - xT); // 0,2 a 0,95 del tramo
    const test = S.test ? (qOf(S.sel)?.backtest ?? []).filter((p) => (idx.get(p.t) ?? -1) >= i0) : [];
    const shown = S.open ? HORIZONS.map((x) => fcs[x.h]).filter(Boolean) : [];

    // Escala: lo visible, con las franjas y las previsiones de test si están a la vista
    const vals = [...line.map((p) => p.v), ...shown.flatMap((f) => [f.p10, f.p90])];
    for (const k of [50, 200] as const)
      if (S[`ma${k}`]) for (let i = i0; i < closes.length; i++) if (ma[k][i] != null) vals.push(ma[k][i] as number);
    for (const p of test) vals.push(p.lo80, p.hi80);
    const sc = priceScale(vals);
    const tf = (v: number) => (S.log ? Math.log(Math.max(v, 0.5)) : v);
    const y = (v: number) => m.t + (H - m.t - m.b) * (1 - (tf(v) - tf(sc.lo)) / (tf(sc.hi) - tf(sc.lo)));
    const pts = (a: [number, number][]) => a.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    const out: string[] = [];

    // Rejilla y eje de precios a la derecha
    for (const v of niceTicks(sc.lo, sc.hi, Math.max(3, Math.round((H - m.t - m.b) / 70)))) {
      if (S.log && v <= 0) continue;
      out.push(
        `<line class="grid" x1="${m.l}" x2="${xEnd}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${xEnd + 8}" y="${y(v) + 4}">${nf(v)}</text>`,
      );
    }
    // Eje de fechas: meses o años según el rango, sin solaparse
    let last = Number.NEGATIVE_INFINITY;
    const byYear = n > 400;
    for (let i = i0 + 1; i < mk.history.length; i++) {
      const [a, b] = [mk.history[i - 1].t, mk.history[i].t];
      const cut = byYear ? a.slice(0, 4) !== b.slice(0, 4) : a.slice(0, 7) !== b.slice(0, 7);
      if (!cut || xi(i) - last < (byYear ? 44 : 56) || xT - xi(i) < 36 || xi(i) < m.l + 18) continue;
      last = xi(i);
      const lab = byYear ? b.slice(0, 4) : `${MONTHS[Number(b.slice(5, 7)) - 1]}${b.slice(5, 7) === "01" ? ` ${b.slice(0, 4)}` : ""}`;
      out.push(`<line class="tick" x1="${xi(i)}" x2="${xi(i)}" y1="${H - m.b}" y2="${H - m.b + 5}"/><text class="ax" x="${xi(i)}" y="${H - m.b + 20}" text-anchor="middle">${lab}</text>`);
    }

    // Tramo futuro: fondo, un hueco por plazo y su red debajo
    out.push(`<rect class="future" x="${xT}" y="${m.t - 24}" width="${xEnd - xT}" height="${H - m.t - m.b + 24}" rx="8"/>`);
    HORIZONS.forEach((hz, k) => {
      const sp = spec(hz.h);
      const on = S.open && hz.h === S.sel;
      const lit = S.reveal ? ` style="animation-delay:${250 + k * 220}ms"` : "";
      out.push(`<g class="col${on ? " on" : ""}${S.reveal ? " lit" : ""}" data-h="${hz.h}"${lit}>
        <rect class="hit" x="${xf(hz.h) - 22}" y="${m.t - 24}" width="44" height="${H - m.t + 24}"/>
        <line class="guide" x1="${xf(hz.h)}" x2="${xf(hz.h)}" y1="${m.t}" y2="${H - m.b}"/>
        <text class="hl" x="${xf(hz.h)}" y="${H - m.b + 20}" text-anchor="middle">${narrow ? SHORT[hz.h] : hz.label}</text>
        <text class="cell" x="${xf(hz.h)}" y="${H - m.b + 38}" text-anchor="middle">${sp?.cell ? CELL[sp.cell] : ""}</text></g>`);
    });
    if (!narrow) out.push(`<text class="zone" x="${xT + 12}" y="${m.t - 8}">Previsión</text>`);

    // Previsiones de test del plazo elegido: franja, red y persistencia sobre la serie real
    if (test.length) {
      const t0 = idx.get(test[0].t) as number;
      const ser = (f: (p: (typeof test)[number]) => number) =>
        downsample(test.map(f), b).map((p) => [xi(t0 + p.i), y(p.v)] as [number, number]);
      const hi = ser((p) => p.hi80);
      const lo = ser((p) => p.lo80);
      out.push(`<polygon class="tband" points="${pts([...hi, ...lo.reverse()])}"/>`);
      out.push(`<polyline class="tpers" points="${pts(ser((p) => p.persistence))}"/>`);
      out.push(`<polyline class="tpred" points="${pts(ser((p) => p.pred))}"/>`);
    }

    // Medias móviles y serie real
    for (const k of [50, 200] as const) {
      if (!S[`ma${k}`]) continue;
      const a = downsample(ma[k].slice(i0), b).map((p) => [xi(p.i + i0), y(p.v)] as [number, number]);
      out.push(`<polyline class="ma ma${k}" points="${pts(a)}"/>`);
    }
    out.push(`<polyline class="price${S.draw ? " draw" : ""}" pathLength="1" points="${pts(line.map((p) => [xi(p.i), y(p.v)]))}"/>`);

    // Sucesos: un punto sobre la línea y su nombre en una píldora, sin solaparse entre ellos
    const ev: string[] = [];
    if (S.events) {
      const placed: { x0: number; x1: number; y: number }[] = [];
      const at = (i: number) => {
        const k = line.findIndex((p) => p.i >= i);
        if (k <= 0) return line[Math.max(0, k)].v;
        const [a, c] = [line[k - 1], line[k]];
        return a.v + ((i - a.i) / (c.i - a.i)) * (c.v - a.v);
      };
      for (const e of mk.events) {
        const ii = idx.get(e.t);
        if (ii === undefined || ii < i0) continue;
        const [px, py] = [xi(ii), y(at(ii))];
        const w = e.label.length * 7.1 + 18;
        const up = py - 40 > m.t;
        let ly = up ? py - 30 : py + 30;
        const lx = Math.max(m.l, Math.min(xT - w - 6, px - w / 2));
        while (placed.some((q) => lx < q.x1 + 6 && lx + w > q.x0 - 6 && Math.abs(q.y - ly) < 26)) ly += up ? -26 : 26;
        placed.push({ x0: lx, x1: lx + w, y: ly });
        ev.push(`<g class="evg"><line class="evlead" x1="${px}" y1="${py}" x2="${px}" y2="${ly + (up ? 12 : -12)}"/>
          <rect class="evpill" x="${lx}" y="${ly - 12}" width="${w}" height="24" rx="12"/>
          <text class="evl" x="${lx + w / 2}" y="${ly + 4.5}" text-anchor="middle">${e.label}</text>
          <circle class="evdot" cx="${px}" cy="${py}" r="4.5"/></g>`);
      }
    }

    // Ventana de entrada: recorre la serie antes de prever y se fija en los últimos días después
    const win = (S.open ? spec(S.sel)?.window : spec(21)?.window) ?? 60;
    const ww = Math.max(6, (win / n) * (xT - m.l));
    const wlab = `${win} días de entrada`;
    if (!S.open && !reduced())
      out.push(`<g class="scan" style="--dx:${(xT - ww - m.l).toFixed(1)}px"><rect class="win" x="${m.l}" y="${m.t}" width="${ww}" height="${H - m.t - m.b}" rx="4"/><text class="wl" x="${m.l + ww / 2}" y="${m.t - 8}" text-anchor="middle">${wlab}</text></g>`);
    else
      out.push(`<g class="winfix"><rect class="win" x="${xT - ww}" y="${m.t}" width="${ww}" height="${H - m.t - m.b}" rx="4"/>${narrow || S.test ? "" : `<text class="wl" x="${xT - ww - 6}" y="${m.t - 8}" text-anchor="end">${wlab}</text>`}</g>`);

    // Hoy
    out.push(`<line class="now" x1="${xT}" x2="${xT}" y1="${m.t}" y2="${H - m.b}"/>${narrow ? "" : `<text class="hoy" x="${xT}" y="${H - m.b + 20}" text-anchor="middle">Hoy</text>`}`);
    out.push(...ev);

    // Franjas: envolvente que se abre hacia la derecha, barra p10–p90 y p50 por plazo
    if (shown.length === HORIZONS.length) {
      const y0 = y(mk.last);
      const F = HORIZONS.map((hz) => ({ hz, f: fcs[hz.h], x: xf(hz.h) }));
      out.push(`<clipPath id="open"><rect class="${S.reveal ? "grow" : ""}" x="${xT}" y="0" width="${W - xT}" height="${H}"/></clipPath>`);
      out.push(`<g clip-path="url(#open)">
        <polygon class="env" points="${pts([[xT, y0], ...F.map(({ x, f }) => [x, y(f.p90)] as [number, number]), ...[...F].reverse().map(({ x, f }) => [x, y(f.p10)] as [number, number])])}"/>
        <polyline class="med" points="${pts([[xT, y0], ...F.map(({ x, f }) => [x, y(f.p50)] as [number, number])])}"/></g>`);
      F.forEach(({ hz, f, x }, k) => {
        const on = hz.h === S.sel;
        const d = S.reveal ? ` style="animation-delay:${450 + k * 220}ms"` : "";
        out.push(`<g class="bar${on ? " on" : ""}${S.reveal ? " pop" : ""}" data-h="${hz.h}"${d}>
          <line x1="${x}" x2="${x}" y1="${y(f.p90)}" y2="${y(f.p10)}"/><circle cx="${x}" cy="${y(f.p50)}" r="${on ? 6 : 4.5}"/>
          ${on ? `<text class="bl" x="${x > xEnd - 50 ? x + 8 : x}" y="${Math.max(m.t - 8, y(f.p90) - 10)}" text-anchor="${x > xEnd - 50 ? "end" : "middle"}">${nf(f.p10)}–${nf(f.p90)} $</text>` : ""}</g>`);
      });
    }
    out.push(`<circle class="dot0" cx="${xT}" cy="${y(mk.last)}" r="5"/>`);

    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria()}">${out.join("")}</svg>${
      S.test ? `<div class="legend"><span><i class="lg real"></i>Real</span><span><i class="lg pred"></i>Red</span><span><i class="lg pers"></i>Persistencia</span><span><i class="lg band"></i>Franja del 80 %, ${HORIZONS.find((x) => x.h === S.sel)?.label}</span></div>` : ""
    }`;
  }
  const aria = () => {
    const base = `Brent ${usd(mk.last)} el ${longDate(mk.ts)}.`;
    if (!S.open) return base;
    return `${base} ${HORIZONS.map((x) => `${x.label}: entre ${usd(fcs[x.h].p10)} y ${usd(fcs[x.h].p90)}`).join("; ")}.`;
  };

  // ── panel del plazo elegido ──
  function detail() {
    const hz = HORIZONS.find((x) => x.h === S.sel) ?? HORIZONS[0];
    const f = fcs[hz.h];
    const sp = spec(hz.h);
    const q = qOf(hz.h);
    const cv = q ? coverage(q) : null;
    const ch = pct(f.p50, mk.last);
    $("detail").innerHTML = `
      <div class="hseg" role="group" aria-label="Plazo">${HORIZONS.map((x) => `<button type="button" data-h="${x.h}" aria-pressed="${x.h === hz.h}">${x.label}</button>`).join("")}</div>
      <div class="d-main">
        <span class="d-date num">Para el ${longDate(tradingDayAfter(mk.ts, hz.h))}</span>
        <span class="d-p50 num">${usd(f.p50)}</span>
        <span class="d-chg num ${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "+" : "−"}${nf(Math.abs(ch), 1)} % sobre hoy</span>
      </div>
      <p class="d-rng num">8 de cada 10 casos entre <b>${nf(f.p10)}</b> y <b>${nf(f.p90)} $</b></p>
      <dl class="d-test">
        <div><dt>Red</dt><dd>${sp?.cell ? CELL[sp.cell] : "—"}, lee ${sp?.window ?? "—"} días</dd></div>
        ${cv ? `<div><dt>Franja, test ${testYears}</dt><dd class="num">${cv.net} de 100<span>persistencia, ${cv.base}</span></dd></div>` : ""}
        ${q ? `<div><dt>Error medio, test</dt><dd class="num">${usd(q.metrics.mae)}<span>persistencia, ${usd(q.baseline.mae)}</span></dd></div>` : ""}
      </dl>`;
  }

  // ── barra de herramientas ──
  $("range").innerHTML = RANGES.map((r) => `<button type="button" data-range="${r.k}" aria-pressed="${r.k === S.range}">${r.k}</button>`).join("");
  const press = (sel: string, on: (b: HTMLElement) => boolean) =>
    document.querySelectorAll<HTMLElement>(sel).forEach((b) => b.setAttribute("aria-pressed", String(on(b))));
  document.querySelector(".tools")?.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!b) return;
    if (b.dataset.range) S.range = b.dataset.range as typeof S.range;
    if (b.dataset.scale) S.log = b.dataset.scale === "log";
    const t = b.dataset.tog as "ma50" | "ma200" | "events" | "test" | undefined;
    if (t) S[t] = !S[t];
    // Las previsiones de test empiezan en 2023: con 6 meses apenas se verían
    if (t === "test" && S.test && S.range === "6M") S.range = "5A";
    press("[data-range]", (x) => x.dataset.range === S.range);
    press("[data-scale]", (x) => (x.dataset.scale === "log") === S.log);
    press("[data-tog]", (x) => S[x.dataset.tog as "ma50"]);
    render();
  });

  // ── elegir plazo: en el panel o en su hueco del gráfico ──
  const choose = (h: number) => {
    if (!S.open || h === S.sel) return;
    S.sel = h;
    S.reveal = false;
    detail();
    render();
    agitate();
  };
  $("detail").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-h]");
    if (b) choose(Number(b.dataset.h));
  });
  $("chart").addEventListener("click", (e) => {
    const g = (e.target as Element).closest<SVGElement>("[data-h]");
    if (g) choose(Number(g.dataset.h));
  });

  // ── un clic: las cuatro redes abren su franja ──
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
    S.open = true;
    S.reveal = !reduced();
    $("intro").hidden = true;
    $("detail").hidden = false;
    document.body.classList.add("is-open");
    detail();
    render();
    agitate();
    setTimeout(() => (S.reveal = false), 2000);
  });

  let t = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(t);
    t = requestAnimationFrame(render);
  }).observe($("chart"));
  render();
  setTimeout(() => (S.draw = false), 1800);
}

init().catch((err: Error) => {
  $("lead").textContent = err.message;
});
