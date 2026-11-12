// Portal con dinero ficticio: rutas (#/mercado, #/cartera, #/y-si, #/historial), cartera simulada,
// «¿y si…?», evaluaciones en un recuadro e historial descargable. La lógica está en sim.ts y store.ts;
// aquí solo se construye el HTML con las clases de Sonda y se enlazan los eventos.
import { probUp } from "../explain";
import { esc, type Forecast, type Html, horizonLabel, S, type SondaMarket } from "../sonda";
import { lineChart } from "./chart";
import { closeModal, openModal, showError } from "./modal";
import { evaluate, followModel, type PricePoint, whatIf } from "./sim";
import {
  addRecord,
  closePosition,
  emptyState,
  type HistoryRecord,
  historyCsv,
  KIND_LABEL,
  load,
  openPosition,
  type PortalState,
  parseState,
  type RecordKind,
  removeRecord,
  save,
  summary,
} from "./store";

export interface PortalContext {
  market: SondaMarket;
  forecasts: Forecast[];
  history: PricePoint[];
  /** Se llama al volver a Mercado, para reajustar el gráfico (estaba oculto). */
  onMarketShown: () => void;
}

const ROUTES = ["mercado", "cartera", "y-si", "historial"] as const;
type Route = (typeof ROUTES)[number];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (v: number) => `${S.fmt.num(v)} $`;
const signedMoney = (v: number) => `${S.fmt.signed(v)} $`;
const signedPct = (v: number) => S.fmt.signed(v * 100, 2, " %");
const nowIso = () => new Date().toISOString();
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${S.fmt.longDate(iso.slice(0, 10))} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const kv = (rows: [string, string][]) =>
  `<dl class="bx-kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
const twoCols = (params: [string, string][], result: [string, string][]) =>
  `<div class="kv2"><div><h3 class="sec">Consulta</h3>${kv(params)}</div><div><h3 class="sec">Resultado</h3>${kv(result)}</div></div>`;
const tone = (v: number) => (v > 0 ? "bx-up-text" : v < 0 ? "bx-down-text" : "bx-muted");
const fakeBadge = '<span class="fake">Dinero ficticio</span>';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const amountInput = (id: string, value: number, max?: number) =>
  `<label class="field"><span>Importe ficticio ($)</span><input id="${id}" type="number" inputmode="decimal" min="1" step="any" value="${Math.round(value)}"${max != null ? ` max="${max.toFixed(2)}"` : ""}></label>`;
const readAmount = (body: HTMLElement, id: string) => Number((body.querySelector(`#${id}`) as HTMLInputElement).value);

export function mountPortal(ctx: PortalContext): void {
  const { market, forecasts } = ctx;
  const price = market.last;
  const dataDate = market.ts;
  let state: PortalState = load();
  let route: Route = "mercado";

  const set = (s: PortalState) => {
    state = s;
    save(state);
    renderAll();
  };
  const record = (kind: RecordKind, title: string, params: [string, string][], result: [string, string][]) =>
    set(addRecord(state, { at: nowIso(), kind, title, params, result }));

  // ── piezas comunes ─────────────────────────────────────────
  function balanceChip() {
    const sm = summary(state, price);
    $("balance").innerHTML = `Total ficticio <b>${money(sm.total)}</b>`;
  }

  function miniCard(): Html {
    const sm = summary(state, price);
    const rows: [string, string][] = [
      ["Efectivo", money(sm.cash)],
      ["En Brent", sm.barrels ? `${S.fmt.num(sm.barrels, 2)} bbl · ${money(sm.value)}` : "Sin posición"],
    ];
    return `<div class="bx-row card-h"><div class="bx-card-t">Cartera simulada</div><span class="bx-spacer"></span>${fakeBadge}</div>
      <div class="mini-total"><span class="mini-v">${money(sm.total)}</span>${S.ui.chg(sm.total - state.initial, sm.ret)}</div>
      ${kv(rows)}
      <div class="mini-actions">
        <button type="button" class="bx-pill btn-primary" data-act="open-position">Abrir posición</button>
        <button type="button" class="bx-pill bx-pill-solid" data-act="evaluate">Solicitar evaluación</button>
      </div>
      <a class="mini-link" href="#/cartera">Ver cartera completa</a>`;
  }

  // ── Mi cartera ─────────────────────────────────────────────
  function renderCartera() {
    const sm = summary(state, price);
    const tile = (l: string, v: string, sub: Html) =>
      `<div class="bx-card tile"><div class="bx-metric-l">${l}</div><div class="tile-v">${v}</div><div class="tile-s">${sub}</div></div>`;
    const positions = state.positions.length
      ? `<table class="tbl"><thead><tr><th>Abierta</th><th>Barriles</th><th>Entrada</th><th>Valor</th><th>Resultado</th><th></th></tr></thead><tbody>${state.positions
          .map((p) => {
            const v = p.barrels * price;
            return `<tr><td>${stamp(p.openedAt)}<div class="sub">precio del ${S.fmt.day(p.dataDate)}</div></td><td>${S.fmt.num(p.barrels, 2)}</td><td>${money(p.price)}</td><td>${money(v)}</td>
              <td class="${tone(v - p.cost)}">${signedMoney(v - p.cost)}<div class="sub">${signedPct(v / p.cost - 1)}</div></td>
              <td><button type="button" class="bx-pill bx-pill-sm bx-pill-solid" data-act="close-position" data-id="${p.id}">Cerrar posición</button></td></tr>`;
          })
          .join("")}</tbody></table>`
      : `<p class="empty">No hay posiciones abiertas. <button type="button" class="linkbtn" data-act="open-position">Abrir una posición</button></p>`;
    const expected = `<table class="tbl"><thead><tr><th>Horizonte</th><th>Valor central</th><th>Rango probable (80 %)</th><th>Resultado central</th></tr></thead><tbody>${forecasts
      .map((f) => {
        const mid = sm.cash + sm.barrels * f.mid;
        return `<tr><td>${horizonLabel(f.h)}<div class="sub">${S.fmt.longDate(S.tradingDays(dataDate, f.h)[f.h - 1])}</div></td><td>${money(mid)}</td>
          <td>${money(sm.cash + sm.barrels * f.lo)} – ${money(sm.cash + sm.barrels * f.hi)}</td>
          <td class="${tone(mid - state.initial)}">${signedMoney(mid - state.initial)}<div class="sub">${signedPct(mid / state.initial - 1)}</div></td></tr>`;
      })
      .join("")}</tbody></table>`;
    const trades = state.trades.length
      ? `<table class="tbl"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Barriles</th><th>Precio</th><th>Importe</th><th>Resultado</th></tr></thead><tbody>${state.trades
          .map(
            (t) =>
              `<tr><td>${stamp(t.at)}</td><td>${t.kind === "open" ? "Apertura" : "Cierre"}</td><td>${S.fmt.num(t.barrels, 2)}</td><td>${money(t.price)}</td><td>${money(t.amount)}</td>
              <td class="${t.pnl == null ? "bx-muted" : tone(t.pnl)}">${t.pnl == null ? "—" : signedMoney(t.pnl)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : '<p class="empty">Todavía no hay movimientos.</p>';
    $("view-cartera").innerHTML = `
      <div class="page-h"><h2>Mi cartera</h2>${fakeBadge}<span class="bx-spacer"></span>
        <button type="button" class="bx-pill btn-primary" data-act="open-position">Abrir posición</button>
        <button type="button" class="bx-pill bx-pill-solid" data-act="evaluate">Solicitar evaluación</button>
        <button type="button" class="bx-pill bx-pill-solid" data-act="export">Exportar</button>
        <button type="button" class="bx-pill bx-pill-solid" data-act="import">Importar</button>
        <button type="button" class="bx-pill" data-act="reset">Reiniciar</button></div>
      <div class="tiles">
        ${tile("Valor total", money(sm.total), S.ui.chg(sm.total - state.initial, sm.ret))}
        ${tile("Efectivo", money(sm.cash), `<span class="bx-muted">Capital inicial ${money(state.initial)}</span>`)}
        ${tile("En Brent", money(sm.value), `<span class="bx-muted">${S.fmt.num(sm.barrels, 2)} barriles a ${money(price)}</span>`)}
        ${tile("Resultado", signedMoney(sm.unrealized + sm.realized), `<span class="bx-muted">Abierto ${signedMoney(sm.unrealized)} · cerrado ${signedMoney(sm.realized)}</span>`)}
      </div>
      <div class="bx-ws-pair">
        <section class="bx-card"><div class="bx-card-t">Posiciones abiertas</div>${positions}</section>
        <section class="bx-card"><div class="bx-card-t">Valor esperado de la cartera</div>${expected}</section>
      </div>
      <section class="bx-card"><div class="bx-card-t">Movimientos</div>${trades}</section>
      <p class="foot">Precios del ${S.fmt.longDate(dataDate)}: las posiciones se abren y valoran al último precio exportado y se revalorizan cuando se actualizan los datos.</p>`;
  }

  // ── ¿Y si…? ───────────────────────────────────────────────
  const PRESETS: [string, string][] = [
    ["Hace 1 año", shiftYears(dataDate, -1)],
    ["Hace 5 años", shiftYears(dataDate, -5)],
    ["Máximo de 2008", "2008-07-03"],
    ["Covid 2020", "2020-04-21"],
  ];
  function renderYsi() {
    const first = ctx.history[0].t;
    const recent = state.history.filter((r) => r.kind === "si-invertido" || r.kind === "seguir-modelo").slice(0, 5);
    $("view-y-si").innerHTML = `
      <div class="page-h"><h2>¿Y si…?</h2>${fakeBadge}</div>
      <div class="bx-ws-pair">
        <section class="bx-card form-card">
          <div class="bx-card-t">Si hubiera invertido</div>
          <p class="lead">Qué valdría hoy una inversión en Brent hecha un día del pasado.</p>
          <div class="form-row">${amountInput("wi-amount", 1000)}
            <label class="field"><span>Fecha</span><input id="wi-date" type="date" min="${first}" max="${dataDate}" value="${shiftYears(dataDate, -1)}"></label></div>
          <div class="bx-pills presets">${PRESETS.map(([l, d]) => S.ui.pill(l, { small: true, data: `data-preset="${d}"` })).join("")}</div>
          <div class="form-f"><button type="button" class="bx-pill btn-primary" data-act="whatif">Calcular</button></div>
        </section>
        <section class="bx-card form-card">
          <div class="bx-card-t">Si hubiera seguido al modelo</div>
          <p class="lead">En el periodo de test, invertir solo cuando el modelo preveía subida, frente a estar siempre invertido.</p>
          <div class="form-row">${amountInput("fm-amount", 1000)}
            <div class="field"><span>Horizonte</span><div class="bx-pills seg" id="fm-h">${S.horizons.map((x) => S.ui.pill(x.label, { small: true, active: x.h === 21, data: `data-fm-h="${x.h}"` })).join("")}</div></div></div>
          <div class="form-f"><button type="button" class="bx-pill btn-primary" data-act="follow">Calcular</button></div>
        </section>
      </div>
      <section class="bx-card"><div class="bx-row card-h"><div class="bx-card-t">Últimas consultas</div><span class="bx-spacer"></span><a class="mini-link" href="#/historial">Ver historial</a></div>
        ${recent.length ? historyTable(recent) : '<p class="empty">Las consultas que guardes aparecerán aquí.</p>'}</section>`;
  }

  function runWhatIf() {
    const amount = readAmount(document.body, "wi-amount");
    const date = ($("wi-date") as HTMLInputElement).value;
    const w = whatIf(ctx.history, date, amount);
    if (!w) {
      openModal({ title: "Si hubiera invertido", body: '<p class="lead">Elige un importe mayor que cero y una fecha anterior al último dato.</p>' });
      return;
    }
    const params: [string, string][] = [
      ["Importe", money(amount)],
      ["Inicio", S.fmt.longDate(w.start)],
      ["Precio de inicio", money(w.startPrice)],
    ];
    const result: [string, string][] = [
      [`Valor el ${S.fmt.longDate(w.end)}`, money(w.value)],
      ["Resultado", `${signedMoney(w.value - amount)} (${signedPct(w.ret)})`],
      ["Rendimiento anual", signedPct(w.annual)],
      ["Peor caída intermedia", S.fmt.pct(w.drawdown, 1)],
      ["Barriles", S.fmt.num(w.barrels, 2)],
    ];
    const title = `${money(amount)} en Brent el ${S.fmt.longDate(w.start)}`;
    openModal({
      title: "Si hubiera invertido",
      wide: true,
      body: `<div class="res-h"><div><div class="res-l">${esc(title)}</div><div class="res-v">${money(w.value)}</div>${S.ui.chg(w.value - amount, w.ret)}</div></div>
        <div id="m-chart" class="res-chart"></div>${twoCols(params, result)}`,
      onMount: (b) =>
        lineChart(
          b.querySelector("#m-chart") as HTMLElement,
          w.curve.map((p) => p.t),
          [{ label: "Valor", cls: "bx-l-actual", key: "bx-key-actual", values: w.curve.map((p) => p.value) }],
        ),
      actions: [
        { label: "Cerrar" },
        { label: "Guardar en el historial", primary: true, run: () => void record("si-invertido", title, params, result) },
      ],
    });
  }

  function runFollow() {
    const amount = readAmount(document.body, "fm-amount");
    const h = Number(document.querySelector<HTMLElement>("#fm-h .is-active")?.dataset.fmH ?? 21);
    const f = forecasts.find((x) => x.h === h);
    const r = f?.quality ? followModel(f.quality.backtest, h) : null;
    if (!r || !(amount > 0)) {
      openModal({ title: "Si hubiera seguido al modelo", body: '<p class="lead">Elige un importe mayor que cero.</p>' });
      return;
    }
    const params: [string, string][] = [
      ["Importe", money(amount)],
      ["Horizonte", `${horizonLabel(h)} · ${f?.model ?? ""}`],
      ["Periodo de test", `${S.fmt.longDate(r.start)} – ${S.fmt.longDate(r.end)}`],
    ];
    const result: [string, string][] = [
      ["Siguiendo al modelo", `${money(amount * r.strategy)} (${signedPct(r.strategy - 1)})`],
      ["Siempre invertido", `${money(amount * r.always)} (${signedPct(r.always - 1)})`],
      ["Tramos invertido", `${r.invested} de ${r.periods}`],
      ["Acierta si sube o baja", `${S.fmt.pct(r.hits / r.periods)} de los tramos`],
    ];
    const beat = r.strategy > r.always;
    const title = `Seguir al modelo a ${horizonLabel(h)} con ${money(amount)}`;
    openModal({
      title: "Si hubiera seguido al modelo",
      wide: true,
      body: `<div class="res-h"><div><div class="res-l">${esc(title)}</div><div class="res-v">${money(amount * r.strategy)}</div>${S.ui.chg(amount * (r.strategy - 1), r.strategy - 1)}</div>
          <div class="res-badge">${S.ui.badge(beat ? "Mejor que estar siempre invertido" : "Peor que estar siempre invertido", beat ? "up" : "warn")}</div></div>
        <div id="m-chart" class="res-chart"></div>${twoCols(params, result)}
        <p class="foot">Periodo de test: el modelo no se ajustó con estos datos. Tramos de ${h} días hábiles sin solape.</p>`,
      onMount: (b) =>
        lineChart(
          b.querySelector("#m-chart") as HTMLElement,
          r.curve.map((p) => p.t),
          [
            { label: "Siguiendo al modelo", cls: "bx-l-fc lc-solid", key: "bx-key-fc", values: r.curve.map((p) => amount * p.strategy) },
            { label: "Siempre invertido", cls: "bx-l-actual", key: "bx-key-actual", values: r.curve.map((p) => amount * p.always) },
          ],
        ),
      actions: [
        { label: "Cerrar" },
        { label: "Guardar en el historial", primary: true, run: () => void record("seguir-modelo", title, params, result) },
      ],
    });
  }

  // ── posiciones y evaluación (recuadros) ─────────────────────
  function openPositionModal(initial = Math.min(1000, Math.floor(state.cash))) {
    const preview = (amount: number) =>
      !(amount > 0)
        ? "Introduce un importe"
        : amount > state.cash
          ? `Supera el efectivo disponible (${money(state.cash)})`
          : `${S.fmt.num(amount / price, 2)} barriles a ${money(price)} · quedan ${money(state.cash - amount)}`;
    openModal({
      title: "Abrir posición",
      body: `<p class="lead">Posición en Brent al último precio (${money(price)}, ${S.fmt.longDate(dataDate)}). ${fakeBadge}</p>
        ${amountInput("op-amount", initial, state.cash)}
        <p class="hint" id="op-preview">${preview(initial)}</p><p class="err" data-error></p>`,
      onMount: (b) => {
        const input = b.querySelector("#op-amount") as HTMLInputElement;
        input.addEventListener("input", () => {
          (b.querySelector("#op-preview") as HTMLElement).textContent = preview(Number(input.value));
        });
      },
      actions: [
        { label: "Cancelar" },
        {
          label: "Abrir posición",
          primary: true,
          run: (b) => {
            const amount = readAmount(b, "op-amount");
            try {
              const next = openPosition(state, amount, price, dataDate, nowIso());
              const p = next.positions[next.positions.length - 1];
              set(
                addRecord(next, {
                  at: nowIso(),
                  kind: "apertura",
                  title: `Posición de ${money(amount)}`,
                  params: [["Importe", money(amount)], ["Precio", money(price)]],
                  result: [["Barriles", S.fmt.num(p.barrels, 2)], ["Efectivo restante", money(next.cash)]],
                }),
              );
            } catch (e) {
              return showError(b, (e as Error).message);
            }
          },
        },
      ],
    });
  }

  function closePositionNow(id: string) {
    const p = state.positions.find((x) => x.id === id);
    if (!p) return;
    const next = closePosition(state, id, price, dataDate, nowIso());
    const pnl = p.barrels * price - p.cost;
    const result: [string, string][] = [
      ["Resultado", `${signedMoney(pnl)} (${signedPct(pnl / p.cost)})`],
      ["Importe recuperado", money(p.barrels * price)],
    ];
    set(
      addRecord(next, {
        at: nowIso(),
        kind: "cierre",
        title: `Cierre de ${S.fmt.num(p.barrels, 2)} barriles`,
        params: [["Precio de entrada", money(p.price)], ["Precio de cierre", money(price)]],
        result,
      }),
    );
    openModal({ title: "Posición cerrada", body: kv(result) });
  }

  function evaluateModal(amount = 1000, h = 21) {
    openModal({
      title: "Solicitar evaluación",
      body: `<p class="lead">Cómo podría ir una posición abierta hoy, según la previsión del modelo de cada horizonte. ${fakeBadge}</p>
        <div class="form-row">${amountInput("ev-amount", amount)}
          <div class="field"><span>Horizonte</span><div class="bx-pills seg" id="ev-h">${S.horizons.map((x) => S.ui.pill(x.label, { small: true, active: x.h === h, data: `data-ev-h="${x.h}"` })).join("")}</div></div></div>
        <p class="err" data-error></p>`,
      onMount: (b) =>
        b.querySelector("#ev-h")?.addEventListener("click", (e) => {
          const t = (e.target as HTMLElement).closest<HTMLElement>("[data-ev-h]");
          if (!t) return;
          b.querySelectorAll("[data-ev-h]").forEach((x) => x.classList.toggle("is-active", x === t));
        }),
      actions: [
        { label: "Cancelar" },
        {
          label: "Evaluar",
          primary: true,
          run: (b) => {
            const a = readAmount(b, "ev-amount");
            const hh = Number(b.querySelector<HTMLElement>("#ev-h .is-active")?.dataset.evH ?? 21);
            if (!(a > 0)) return showError(b, "El importe debe ser mayor que cero.");
            evaluationResult(a, hh);
            return false;
          },
        },
      ],
    });
  }

  function evaluationResult(amount: number, h: number) {
    const f = forecasts.find((x) => x.h === h) as Forecast;
    const p = probUp(price, f);
    const e = evaluate(price, f, amount, p);
    const target = S.tradingDays(dataDate, h)[h - 1];
    const q = f.quality;
    const better = q ? q.metrics.mae < q.baseline.mae : false;
    const params: [string, string][] = [
      ["Importe", money(amount)],
      ["Horizonte", `${horizonLabel(h)} · ${f.model ?? ""}`],
      ["Precio de entrada", `${money(price)} (${S.fmt.longDate(dataDate)})`],
    ];
    const result: [string, string][] = [
      ["Valor previsto", money(e.value.mid)],
      ["Resultado previsto", `${signedMoney(e.pnl.mid)} (${signedPct(e.pnl.mid / amount)})`],
      ["Rango probable (80 %)", `${money(e.value.lo)} – ${money(e.value.hi)}`],
      ["Peor caso del rango", signedMoney(e.pnl.lo)],
      ["Mejor caso del rango", signedMoney(e.pnl.hi)],
      ["Probabilidad de ganar", S.fmt.pct(p)],
      ["Fecha objetivo", S.fmt.longDate(target)],
      ["Barriles", S.fmt.num(e.barrels, 2)],
    ];
    if (q)
      result.push([
        "Fiabilidad del modelo",
        `${better ? "Más preciso" : "Falla más"} que «sin cambios» (${money(q.metrics.mae)} / ${money(q.baseline.mae)})`,
      ]);
    const title = `${money(amount)} a ${horizonLabel(h)}`;
    openModal({
      title: "Evaluación",
      wide: true,
      body: `<div class="res-h"><div><div class="res-l">Valor previsto el ${S.fmt.longDate(target)} · ${esc(title)}</div><div class="res-v bx-fc-text">${money(e.value.mid)}</div>${S.ui.chg(e.pnl.mid, e.pnl.mid / amount)}</div>
          <div class="res-badge">${q ? S.ui.badge(better ? "Más preciso que «sin cambios»" : "Orientativo · falla más que «sin cambios»", better ? "up" : "warn") : ""}</div></div>
        ${gainMeter(p)}
        ${twoCols(params, result)}`,
      actions: [
        { label: "Volver", run: () => (evaluateModal(amount, h), false) },
        { label: "Abrir esta posición", run: () => (openPositionModal(Math.min(amount, Math.floor(state.cash))), false) },
        { label: "Guardar en el historial", primary: true, run: () => void record("evaluacion", title, params, result) },
      ],
    });
  }

  // ── Historial ─────────────────────────────────────────────
  function historyTable(records: HistoryRecord[]): Html {
    return `<table class="tbl hist"><thead><tr><th>Fecha</th><th>Tipo</th><th>Consulta</th><th>Resultado</th><th></th></tr></thead><tbody>${records
      .map(
        (r) => `<tr><td>${stamp(r.at)}</td><td><span class="kind kind-${r.kind}">${KIND_LABEL[r.kind]}</span></td><td>${esc(r.title)}</td>
          <td>${r.result[0] ? `<span class="bx-muted">${esc(r.result[0][0])}</span> ${esc(r.result[0][1])}` : ""}</td>
          <td class="acts"><button type="button" class="bx-pill bx-pill-sm bx-pill-solid" data-act="rec-view" data-id="${r.id}">Ver</button>
            <button type="button" class="bx-pill bx-pill-sm" data-act="rec-del" data-id="${r.id}" aria-label="Borrar consulta">Borrar</button></td></tr>`,
      )
      .join("")}</tbody></table>`;
  }
  function renderHistorial() {
    const n = state.history.length;
    $("view-historial").innerHTML = `
      <div class="page-h"><h2>Historial</h2><span class="bx-muted">${n} ${n === 1 ? "consulta" : "consultas"}</span><span class="bx-spacer"></span>
        <button type="button" class="bx-pill bx-pill-solid" data-act="csv"${n ? "" : " disabled"}>Descargar CSV</button>
        <button type="button" class="bx-pill bx-pill-solid" data-act="json">Descargar JSON</button>
        <button type="button" class="bx-pill" data-act="clear-history"${n ? "" : " disabled"}>Borrar historial</button></div>
      <section class="bx-card">${n ? historyTable(state.history) : '<p class="empty">Aún no hay consultas. Solicita una evaluación o prueba «¿Y si…?» y guarda el resultado.</p>'}</section>
      <p class="foot">El historial y la cartera se guardan solo en este navegador. Descarga el JSON para conservarlos o llevarlos a otro equipo.</p>`;
  }
  function viewRecord(id: string) {
    const r = state.history.find((x) => x.id === id);
    if (!r) return;
    openModal({
      title: KIND_LABEL[r.kind],
      wide: true,
      body: `<div class="res-l">${esc(r.title)} · ${stamp(r.at)}</div>${twoCols(r.params, r.result)}`,
    });
  }

  // ── exportar, importar y reiniciar ─────────────────────────
  const today = () => new Date().toISOString().slice(0, 10);
  const exportJson = () => download(`sonda-cartera-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
  function importJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        set(parseState(await file.text()));
        openModal({ title: "Cartera importada", body: `<p class="lead">Se ha cargado «${esc(file.name)}».</p>` });
      } catch (e) {
        openModal({ title: "No se pudo importar", body: `<p class="lead">${esc((e as Error).message)}</p>` });
      }
    });
    input.click();
  }
  function confirm(title: string, text: string, label: string, run: () => void) {
    openModal({
      title,
      body: `<p class="lead">${text}</p>`,
      actions: [{ label: "Cancelar" }, { label, primary: true, run: () => void run() }],
    });
  }

  // ── rutas y eventos ───────────────────────────────────────
  function renderAll() {
    balanceChip();
    $("mini").innerHTML = miniCard();
    if (route === "cartera") renderCartera();
    if (route === "y-si") renderYsi();
    if (route === "historial") renderHistorial();
  }
  function go() {
    const r = location.hash.replace(/^#\/?/, "") as Route;
    const prev = route;
    route = ROUTES.includes(r) ? r : "mercado";
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((v) => {
      v.hidden = v.dataset.view !== route;
    });
    document.querySelectorAll<HTMLElement>("[data-route]").forEach((a) => {
      const on = a.dataset.route === route;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    closeModal();
    renderAll();
    if (route === "mercado" && prev !== "mercado") ctx.onMarketShown();
    if (prev !== route) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", go);

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const preset = t.closest<HTMLElement>("[data-preset]");
    if (preset) ($("wi-date") as HTMLInputElement).value = preset.dataset.preset as string;
    const fm = t.closest<HTMLElement>("[data-fm-h]");
    if (fm) document.querySelectorAll("[data-fm-h]").forEach((x) => x.classList.toggle("is-active", x === fm));
    const b = t.closest<HTMLElement>("[data-act]");
    if (!b || b.closest("dialog")) return;
    const id = b.dataset.id as string;
    switch (b.dataset.act) {
      case "open-position":
        return openPositionModal();
      case "close-position":
        return closePositionNow(id);
      case "evaluate":
        return evaluateModal();
      case "whatif":
        return runWhatIf();
      case "follow":
        return runFollow();
      case "export":
      case "json":
        return exportJson();
      case "import":
        return importJson();
      case "csv":
        return download(`sonda-historial-${today()}.csv`, `﻿${historyCsv(state.history)}`, "text/csv;charset=utf-8");
      case "reset":
        return confirm(
          "Reiniciar la cartera",
          `Se borran posiciones, movimientos e historial y el efectivo vuelve a ${money(state.initial)}. Descarga antes el JSON si quieres conservarlos.`,
          "Reiniciar",
          () => set(emptyState(state.initial)),
        );
      case "clear-history":
        return confirm("Borrar historial", "Se borran todas las consultas guardadas. La cartera no cambia.", "Borrar", () =>
          set({ ...state, history: [] }),
        );
      case "rec-view":
        return viewRecord(id);
      case "rec-del":
        return set(removeRecord(state, id));
    }
  });
  go();
}

/** Medidor de dirección de Sonda con el lenguaje de una posición: ganar o perder en vez de subir o bajar. */
function gainMeter(p: number): Html {
  return S.ui
    .directionMeter(p)
    .replace("Más probable que suba", "Más probable ganar")
    .replace("Más probable que baje", "Más probable perder")
    .replaceAll("Sube ", "Gana ")
    .replaceAll("Baja ", "Pierde ")
    .replaceAll(", baja ", ", pierde ");
}

/** Misma fecha `years` años antes o después (AAAA-MM-DD). */
function shiftYears(t: string, years: number): string {
  const d = new Date(`${t}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
