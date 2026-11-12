// Sonda · predicción del Brent. Los componentes visuales vienen del sistema de diseño Sonda
// (src/sonda/: bundle.js, bundle.css y tokens.css, copiados del artefacto del sistema de diseño):
// se usan su motor de gráficos (charts.lineChart, charts.interval), sus iconos y sus clases bx-*,
// alimentados con los datos reales de make export-web en lugar de sus datos simulados.
// Versión WebAssembly (CPU): el .wasm se empaqueta con la web, sin depender de un CDN.
import * as ort from "onnxruntime-web/wasm";
import {
  type BacktestPoint,
  backtestBias,
  type Driver,
  fanPath,
  type HorizonForecast,
  nextTradingDays,
  occlusion,
  probUp,
} from "./explain";
import { type Bundle, type Manifest, predict, type Row } from "./model";
import "./sonda/tokens.css";
import "./sonda/bundle.css";
import "./sonda/bundle.js";
import "./style.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

// ── datos exportados ─────────────────────────────────────────
interface CycleEvent {
  t: string;
  price: number;
  label: string;
  text: string;
  kind: "max" | "min";
}
interface Market {
  asset: string;
  last: number;
  change: number;
  ts: string;
  history: { t: string; close: number }[];
  events: CycleEvent[];
  features: string[];
  rows: { t: string[]; values: Row[] };
}
interface Quality {
  horizon: number;
  period: [string, string];
  n: number;
  metrics: { hit_rate: number; mae: number; rmse: number; coverage80: number };
  baseline: {
    mae: number;
    rmse: number;
    coverage80: number;
    hit_rate_best_constant: number;
    best_constant: "up" | "down";
  };
  backtest: BacktestPoint[];
}
interface View {
  m: Manifest;
  q: Quality;
  f: HorizonForecast;
  drivers: Driver[];
}

// ── Sonda (bundle.js asigna window.Sonda) ────────────────────
type Html = string;
interface SondaApi {
  fmt: { num(v: number, dp?: number): string; signed(v: number, dp?: number, suf?: string): string };
  charts: {
    lineChart(host: HTMLElement, o: object): unknown;
    interval(host: HTMLElement, o: object): void;
  };
  ui: {
    icon(name: string, o?: object): Html;
    logo(o?: object): Html;
    arrow(v: number, size?: number): Html;
    chg(v: number, pct?: number, dp?: number): Html;
    badge(text: string, tone?: string): Html;
    status(state: string, text: string): Html;
    rosette(size: number): Html;
    bindSeg(el: HTMLElement): void;
  };
}
const S = (window as unknown as { Sonda: SondaApi }).Sonda;
const { num, signed } = S.fmt;
const pct = (v: number, dp = 0) => `${num(v * 100, dp)} %`;

const HORIZONS: Record<number, { label: string; short: string; plain: string; hist: number }> = {
  5: { label: "1 semana", short: "1S", plain: "dentro de 5 días hábiles (una semana)", hist: 60 },
  21: { label: "1 mes", short: "1M", plain: "dentro de 21 días hábiles (un mes)", hist: 120 },
  63: { label: "3 meses", short: "3M", plain: "dentro de 63 días hábiles (tres meses)", hist: 250 },
  252: { label: "1 año", short: "1A", plain: "dentro de 252 días hábiles (un año)", hist: 504 },
};
const LABELS: Record<string, string> = {
  brent: "Brent",
  wti: "WTI",
  henry_hub: "Gas natural (Henry Hub)",
  ecb_deposit_rate: "Tipo de depósito del BCE",
  usd_per_eur: "Dólares por euro",
  cny_per_usd: "Yuanes por dólar",
  vix: "Volatilidad bursátil (VIX)",
  wti_fut_open: "Futuro WTI · apertura",
  wti_fut_high: "Futuro WTI · máximo",
  wti_fut_low: "Futuro WTI · mínimo",
  wti_fut_close: "Futuro WTI · cierre",
  wti_fut_volume: "Futuro WTI · volumen",
  copper: "Cobre",
  gold: "Oro",
  dollar_index: "Índice del dólar",
  brent_vol21: "Volatilidad del Brent (21 días)",
};
const CELL: Record<string, string> = { rnn: "RNN simple", lstm: "LSTM", gru: "GRU" };
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NEUTRAL = [0.45, 0.55]; // probabilidad de subida sin sesgo claro

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const day = (d: Date) => `${d.getUTCDate()} ${MES[d.getUTCMonth()]}`;
const month = (d: Date) => `${MES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
const date = (t: string) => new Date(`${t}T12:00:00Z`);
const longDate = (t: string) => {
  const d = date(t);
  return `${d.getUTCDate()} ${MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

// ── componentes ──────────────────────────────────────────────
function horizonTabs(views: View[], sel: number): Html {
  return `<div class="bx-seg" role="tablist" aria-label="Horizonte">${views
    .map(
      ({ m }) =>
        `<button role="tab" data-h="${m.horizon}" class="bx-seg-item${m.horizon === sel ? " is-active" : ""}" aria-selected="${m.horizon === sel}">${HORIZONS[m.horizon as number].label}</button>`,
    )
    .join("")}</div>`;
}

function priceHeader(mk: Market, v: View): Html {
  const h = HORIZONS[v.m.horizon as number];
  return `<div class="bx-ph">
    <div class="bx-ph-id"><div class="bx-ph-name">Brent</div><div class="bx-ph-venue">Spot · $/bbl</div></div>
    <div class="bx-ph-block"><div class="bx-label">Último · ${day(date(mk.ts))}</div><div class="bx-num-lg">${num(mk.last)}</div>${S.ui.chg(mk.change, mk.change / (mk.last - mk.change))}</div>
    <div class="bx-ph-block bx-ph-fc"><div class="bx-label">Previsto · ${h.label}</div><div class="bx-num-lg bx-fc-text">${num(v.f.mid)}</div>${S.ui.chg(v.f.mid - mk.last, v.f.mid / mk.last - 1)}</div>
    <div class="bx-ph-block"><div class="bx-label">Intervalo 80 %</div><div class="bx-num">${num(v.f.lo)} – ${num(v.f.hi)}</div><div class="bx-muted bx-num-sm">${CELL[v.m.cell ?? ""] ?? ""}</div></div>
  </div>`;
}

function forecastChart(host: HTMLElement, mk: Market, views: View[], v: View, animate: boolean) {
  const H = v.m.horizon as number;
  const hist = mk.history.slice(-HORIZONS[H].hist);
  const path = fanPath(
    mk.last,
    views.map((x) => x.f),
    H,
  );
  const future = nextTradingDays(mk.ts, H);
  const long = hist.length + H > 200;
  const labels = [
    ...hist.map((p) => (long ? month(date(p.t)) : day(date(p.t)))),
    ...future.map((d) => (long ? month(d) : day(d))),
  ];
  const off = hist.length - 1;
  const last = mk.last;
  S.charts.lineChart(host, {
    n: hist.length + H,
    height: 330,
    now: off,
    nowLabel: "Último dato",
    labels,
    label: `Predicción del Brent a ${HORIZONS[H].label}`,
    animate,
    series: [
      { values: hist.map((p) => p.close), offset: 0, cls: "bx-actual" },
      { values: [last, ...path.map((p) => p.mid)], offset: off, cls: "bx-fc" },
    ],
    bands: [
      {
        lo: [last, ...path.map((p) => p.lo80)],
        hi: [last, ...path.map((p) => p.hi80)],
        offset: off,
        cls: "bx-band80",
      },
    ],
    markers: path.flatMap((p, k) =>
      p.computed ? [{ i: off + k + 1, v: p.mid, cls: "bx-dot-fc" }] : [],
    ),
    tags: [
      { value: last, cls: "bx-tag-actual" },
      { value: v.f.mid, cls: "bx-tag-fc" },
    ],
    tooltip: (i: number) => {
      if (i <= off) {
        return {
          v: hist[i].close,
          html: `<div class="bx-tip-h">${longDate(hist[i].t)}</div>${tipRow("Real", num(hist[i].close), "bx-actual")}`,
        };
      }
      const p = path[i - off - 1];
      const kind = p.computed ? "calculado por la red" : "interpolado";
      return {
        v: p.mid,
        html: `<div class="bx-tip-h">${day(future[i - off - 1])} · ${kind}</div>${tipRow("Central", num(p.mid), "bx-fc")}${tipRow("80 %", `${num(p.lo80)} – ${num(p.hi80)}`, "bx-band80")}`,
      };
    },
  });
}

function tipRow(label: string, value: string, cls?: string): Html {
  return `<div class="bx-tip-row"><span>${cls ? `<i class="bx-key ${cls}"></i>` : ""}${label}</span><b>${value}</b></div>`;
}

function forecastCards(mk: Market, views: View[], sel: number): Html {
  return views
    .map(
      (v, i) =>
        `${i ? '<i class="bx-rule-v"></i>' : ""}<div class="bx-fcard${v.m.horizon === sel ? " is-active" : ""}" data-h="${v.m.horizon}" role="button" tabindex="0">
      <div class="bx-fcard-h"><span class="bx-label">${HORIZONS[v.m.horizon as number].label}</span><span class="bx-muted bx-body-sm">${CELL[v.m.cell ?? ""]}</span></div>
      <div class="bx-num-lg">${num(v.f.mid)}</div>${S.ui.chg(v.f.mid - mk.last, v.f.mid / mk.last - 1)}
      <div class="bx-fcard-ib" data-ib="${v.m.horizon}"></div>
      <div class="bx-fcard-range bx-num-sm bx-muted"><span>${num(v.f.lo)}</span><span>80 %</span><span>${num(v.f.hi)}</span></div>
    </div>`,
    )
    .join("");
}

function directionMeter(mk: Market, v: View): Html {
  const up = probUp(mk.last, v.f);
  const neutral = up >= NEUTRAL[0] && up <= NEUTRAL[1];
  const lead = up >= 0.5;
  const head = neutral
    ? `<div class="bx-dm-big">${S.ui.arrow(0, 16)}Sin sesgo claro</div>`
    : `<div class="bx-dm-big bx-${lead ? "up" : "down"}">${S.ui.arrow(lead ? 1 : -1, 16)}${lead ? "Sube" : "Baja"} <b>${pct(lead ? up : 1 - up)}</b></div>`;
  const q = v.q;
  const constant = q.baseline.best_constant === "up" ? "sube" : "baja";
  const better = q.metrics.hit_rate > q.baseline.hit_rate_best_constant;
  return `<div class="bx-dm">
    <div class="bx-dm-head"><span class="bx-label">Dirección · ${HORIZONS[v.m.horizon as number].label}</span><span class="bx-muted bx-body-sm">P(precio &gt; ${num(mk.last)})</span></div>
    ${head}
    <div class="bx-dm-bar" role="img" aria-label="Sube ${pct(up)}, baja ${pct(1 - up)}"><span class="bx-dm-up" style="width:${(up * 100).toFixed(1)}%"></span><span class="bx-dm-down" style="width:${((1 - up) * 100).toFixed(1)}%"></span><i class="bx-dm-mid"></i></div>
    <div class="bx-dm-legend"><span class="bx-up-text">${S.ui.arrow(1, 10)} ${pct(up)}</span><span class="bx-down-text">${S.ui.arrow(-1, 10)} ${pct(1 - up)}</span></div>
    <p class="note">Entre ${month(date(q.period[0]))} y ${month(date(q.period[1]))} acertó la dirección el <b>${pct(q.metrics.hit_rate)}</b> de los días; decir siempre «${constant}» acertaba el <b>${pct(q.baseline.hit_rate_best_constant)}</b>. ${better ? "La ventaja es pequeña." : "No supera a esa regla fija."}</p>
  </div>`;
}

function driverDetail(mk: Market, input: string, window: number): string {
  const j = mk.features.indexOf(input);
  if (j < 0) return "Desviación típica del rendimiento diario";
  const vals = mk.rows.values.map((r) => r[j] as number);
  const now = vals[vals.length - 1];
  const before = vals[vals.length - window];
  if (input === "ecb_deposit_rate") return `${num(now, 2)} % · ${signed(now - before, 2)} pp en ${window} días`;
  return `${num(now, 2)} · ${signed((now / before - 1) * 100, 1, " %")} en ${window} días`;
}

function drivers(mk: Market, v: View): Html {
  const top = [...v.drivers].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 6);
  const list = top.sort((a, b) => b.value - a.value);
  const max = Math.max(...list.map((d) => Math.abs(d.value))) || 1;
  const dir = (x: number) => (x > 0 ? "up" : x < 0 ? "down" : "flat");
  return `<div class="bx-drivers">${list
    .map((d) => {
      const w = (Math.abs(d.value) / max) * 50;
      return `<div class="bx-driver"><div class="bx-driver-name"><div>${LABELS[d.input] ?? d.input}</div><div class="bx-muted bx-body-sm">${driverDetail(mk, d.input, v.m.window ?? 60)}</div></div>
        <div class="bx-driver-bar" role="img" aria-label="${LABELS[d.input] ?? d.input} ${signed(d.value, 2)} dólares"><i class="bx-driver-axis"></i><span class="bx-driver-fill bx-fill-${dir(d.value)}" style="${d.value > 0 ? "left:50%" : "right:50%"};width:${w.toFixed(1)}%"></span></div>
        <div class="bx-num bx-driver-val bx-${dir(d.value)}-text">${signed(d.value, 2)}</div></div>`;
    })
    .join("")}</div>
    <p class="note">Cuánto cambia el precio previsto (en $/bbl) si el modelo no viera esa variable en los últimos ${v.m.window} días. Indica qué usa el modelo, no por qué se mueve el precio.</p>`;
}

function metrics(v: View): Html {
  const { metrics: m, baseline: b } = v.q;
  const skill = 1 - m.rmse / b.rmse;
  const tile = (label: string, value: string, note: string, warn: boolean) =>
    `<div class="bx-metric"><div class="bx-label">${label}</div><div class="bx-num-lg">${value}</div><div class="bx-body-sm ${warn ? "bx-warn-text" : "bx-muted"}">${note}</div></div>`;
  const verdict =
    skill > 0
      ? S.ui.badge(`Mejora a la persistencia (${signed(skill * 100, 0, " %")} RMSE)`, "up")
      : S.ui.badge(`No mejora a la persistencia (${signed(skill * 100, 0, " %")} RMSE)`, "warn");
  return `<div class="verdict">${verdict}</div><div class="bx-metrics">
    ${tile("Acierto dirección", pct(m.hit_rate), `Regla fija: ${pct(b.hit_rate_best_constant)}`, m.hit_rate <= b.hit_rate_best_constant)}
    ${tile("MAE", `${num(m.mae)} $`, `Persistencia: ${num(b.mae)} $`, m.mae >= b.mae)}
    ${tile("RMSE", `${num(m.rmse)} $`, `Persistencia: ${num(b.rmse)} $`, m.rmse >= b.rmse)}
    ${tile("Cobertura 80 %", pct(m.coverage80), `Objetivo 80 % · histórica ${pct(b.coverage80)}`, m.coverage80 < 0.75)}
  </div>`;
}

function backtestChart(host: HTMLElement, v: View) {
  const b = v.q.backtest;
  S.charts.lineChart(host, {
    n: b.length,
    height: 170,
    labels: b.map((p) => month(date(p.t))),
    label: "Backtest en test: real frente a previsto",
    bands: [{ lo: b.map((p) => p.lo80), hi: b.map((p) => p.hi80), offset: 0, cls: "bx-band80" }],
    series: [
      { values: b.map((p) => p.pred), cls: "bx-fc" },
      { values: b.map((p) => p.actual), cls: "bx-actual" },
    ],
    tooltip: (i: number) => {
      const p = b[i];
      const out = p.actual < p.lo80 || p.actual > p.hi80;
      return {
        v: p.actual,
        html: `<div class="bx-tip-h">${longDate(p.t)}</div>${tipRow("Real", num(p.actual), "bx-actual")}${tipRow("Previsto", num(p.pred), "bx-fc")}${tipRow("Persistencia", num(p.persistence))}${out ? '<div class="bx-tip-note">Fuera del intervalo 80 %</div>' : ""}`,
      };
    },
  });
}

/** Texto para un usuario no técnico: qué significa, qué fiabilidad tiene y qué puede invalidarla. */
function explanation(mk: Market, v: View): Html {
  const h = HORIZONS[v.m.horizon as number];
  const { metrics: m, baseline: b } = v.q;
  const change = v.f.mid / mk.last - 1;
  const period = `entre ${month(date(v.q.period[0]))} y ${month(date(v.q.period[1]))}`;
  const bias = backtestBias(v.q.backtest);
  const reliability: string[] = [];
  if (m.rmse >= b.rmse) {
    reliability.push(
      `Comprobado ${period}, este modelo <b>no acierta más que suponer que el precio no cambia</b>: se equivocó de media en ${num(m.mae)} $, frente a ${num(b.mae)} $ de esa regla. Tómalo como una orientación, no como una previsión fiable.`,
    );
  } else {
    reliability.push(
      `Comprobado ${period}, se equivocó de media en ${num(m.mae)} $, menos que suponer que el precio no cambia (${num(b.mae)} $).`,
    );
  }
  reliability.push(
    `El intervalo contuvo el precio real el ${pct(m.coverage80)} de las veces (lo esperado es el 80 %)${m.coverage80 < 0.75 ? ": es más estrecho de lo que debería" : ""}.`,
  );
  if (Math.abs(bias.predicted - bias.actual) > 0.02) {
    reliability.push(
      `En ese periodo previó de media un cambio del ${signed(bias.predicted * 100, 1, " %")}, cuando el real fue del ${signed(bias.actual * 100, 1, " %")}: tiende a ${bias.predicted > bias.actual ? "exagerar las subidas" : "exagerar las bajadas"}.`,
    );
  }
  const oneSide =
    v.f.lo > mk.last
      ? " Todo el intervalo queda por encima del precio actual."
      : v.f.hi < mk.last
        ? " Todo el intervalo queda por debajo del precio actual."
        : "";
  return `<h4>Qué significa</h4>
    <p>El modelo (${CELL[v.m.cell ?? ""]}) prevé que el Brent esté en <b>${num(v.f.mid)} $</b> ${h.plain}, un ${signed(change * 100, 1, " %")} respecto al último precio (${num(mk.last)} $ el ${longDate(mk.ts)}). Según el propio modelo, hay un 80 % de probabilidad de que quede entre ${num(v.f.lo)} y ${num(v.f.hi)} $.${oneSide}</p>
    <h4>Qué fiabilidad tiene</h4>
    <p>${reliability.join(" ")}</p>
    <h4>Qué puede invalidarla</h4>
    <p>El modelo solo ve precios y variables de mercado de los últimos ${v.m.window} días hábiles; no conoce noticias. Un conflicto geopolítico, una decisión de la OPEP+ sobre la producción o un cambio brusco de la economía mundial pueden mover el precio fuera de este rango. Cuanto más lejano el horizonte, más pesa lo que el modelo no ve.</p>`;
}

function cycleChart(host: HTMLElement, mk: Market) {
  const hist = mk.history;
  const idx = new Map(hist.map((p, i) => [p.t, i]));
  const marks = mk.events.map((e, k) => ({ e, k, i: idx.get(e.t) ?? -1 })).filter((x) => x.i >= 0);
  S.charts.lineChart(host, {
    n: hist.length,
    height: 260,
    labels: hist.map((p) => p.t.slice(0, 4)),
    label: "Histórico del Brent desde 2000 con los sucesos del ciclo económico",
    series: [{ values: hist.map((p) => p.close), cls: "bx-actual" }],
    markers: marks.map((x) => ({ i: x.i, v: x.e.price, cls: x.e.kind === "max" ? "bx-dot-up" : "bx-dot-down" })),
    tooltip: (i: number) => {
      const near = marks.find((x) => Math.abs(x.i - i) <= 8);
      return {
        v: hist[i].close,
        html: `<div class="bx-tip-h">${longDate(hist[i].t)}</div>${tipRow("Brent", num(hist[i].close), "bx-actual")}${near ? `<div class="bx-tip-note">${near.k + 1}. ${near.e.label}</div>` : ""}`,
      };
    },
  });
}

function cycleList(mk: Market): Html {
  return `<ol class="events">${mk.events
    .map(
      (e) =>
        `<li><div class="ev-h"><b>${e.label}</b><span class="bx-num bx-${e.kind === "max" ? "up" : "down"}-text">${S.ui.arrow(e.kind === "max" ? 1 : -1, 10)} ${num(e.price)} $ · ${longDate(e.t)}</span></div><div class="bx-muted">${e.text}</div></li>`,
    )
    .join("")}</ol>`;
}

// ── página ───────────────────────────────────────────────────
async function init() {
  const [bundle, mk, quality] = await Promise.all([
    loadJson<Bundle>("model/manifest.json"),
    loadJson<Market>("data/market.json"),
    loadJson<Quality[]>("data/quality.json"),
  ]);
  const views: View[] = [];
  for (const m of bundle.models) {
    const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
    const [lo, mid, hi] = await predict(ort, session, m, mk.rows.values);
    const q = quality.find((x) => x.horizon === m.horizon) as Quality;
    const drv = await occlusion(ort, session, m, mk.rows.values);
    views.push({ m, q, f: { h: m.horizon as number, lo, mid, hi }, drivers: drv });
  }

  $("logo").innerHTML = S.ui.logo({ size: 26 });
  $("status").innerHTML = S.ui.status("delayed", `Datos hasta el ${longDate(mk.ts)}`);
  $("wm").innerHTML = S.ui.rosette(380);
  $("cycle-list").innerHTML = cycleList(mk);
  cycleChart($("cycle"), mk);

  let sel = 5;
  let first = true;
  const lo = Math.min(...views.map((v) => v.f.lo), mk.last);
  const hi = Math.max(...views.map((v) => v.f.hi), mk.last);

  const render = () => {
    const v = views.find((x) => x.m.horizon === sel) as View;
    $("tabs").innerHTML = horizonTabs(views, sel);
    S.ui.bindSeg($("tabs").firstElementChild as HTMLElement);
    $("ph").innerHTML = priceHeader(mk, v);
    $("model-note").textContent =
      `${CELL[v.m.cell ?? ""]} · los puntos marcan los cuatro horizontes que calculan las redes; entre ellos, interpolado`;
    forecastChart($("chart"), mk, views, v, first);
    $("cards").innerHTML = forecastCards(mk, views, sel);
    document.querySelectorAll<HTMLElement>("[data-ib]").forEach((host) => {
      const x = views.find((w) => String(w.m.horizon) === host.dataset.ib) as View;
      S.charts.interval(host, {
        p: { last: mk.last, mid: x.f.mid, lo80: x.f.lo, hi80: x.f.hi, lo95: x.f.lo, hi95: x.f.hi },
        min: lo,
        max: hi,
      });
    });
    $("dm").innerHTML = directionMeter(mk, v);
    $("text").innerHTML = explanation(mk, v);
    $("drv-h").textContent = HORIZONS[sel].label;
    $("drv").innerHTML = drivers(mk, v);
    $("perf-h").textContent = `${HORIZONS[sel].label} · test ${v.q.period[0].slice(0, 4)}–${v.q.period[1].slice(0, 4)}`;
    $("met").innerHTML = metrics(v);
    backtestChart($("bt"), v);
    first = false;
  };
  const choose = (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-h]");
    if (!t) return;
    sel = Number(t.dataset.h);
    render();
  };
  $("tabs").addEventListener("click", choose);
  $("cards").addEventListener("click", choose);
  $("cards").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") choose(e);
  });
  render();
  $("loading").remove();
}

init().catch((err: Error) => {
  $("loading").textContent = err.message;
});
