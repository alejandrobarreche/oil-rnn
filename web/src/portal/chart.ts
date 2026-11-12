// Gráfico de línea mínimo para las curvas de valor del portal (¿y si…?), con las clases SVG de
// Sonda (.bx-grid, .bx-axis, .bx-l-*) y lectura al pasar el cursor.
import { S } from "../sonda";

export interface LineSeries {
  label: string;
  cls: string; // clase de trazo: bx-l-actual, bx-l-fc…
  key: string; // clase de la marca de leyenda: bx-key-actual, bx-key-fc…
  values: number[];
}

const NS = "http://www.w3.org/2000/svg";
function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}
function niceStep(span: number, target: number): number {
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

export function lineChart(host: HTMLElement, t: string[], series: LineSeries[], height = 220, unit = " $"): void {
  const { num, longDate, monthYear } = S.fmt;
  const n = t.length;
  host.innerHTML = '<div class="bx-root"><div class="bx-readout lc-ro"></div><div class="bx-chart-plot lc-plot"></div></div>';
  const plot = host.querySelector(".lc-plot") as HTMLElement;
  const ro = host.querySelector(".lc-ro") as HTMLElement;
  const svg = el("svg", { role: "img", "aria-label": series.map((s) => s.label).join(" y ") });
  plot.appendChild(svg);
  const all = series.flatMap((s) => s.values);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  lo -= pad;
  hi += pad;
  const R = 64;
  const B = 22;
  const T = 6;
  let hover: number | null = null;

  const readout = () => {
    const i = hover ?? n - 1;
    ro.innerHTML =
      `<span class="bx-ro-date">${longDate(t[i])}</span>` +
      series.map((s) => `<span><i class="bx-key ${s.key}"></i>${s.label} <b>${num(s.values[i])}${unit}</b></span>`).join("");
  };
  const render = () => {
    const W = plot.clientWidth || 600;
    const pw = W - R;
    const ph = height - B - T;
    const X = (i: number) => (n > 1 ? (i / (n - 1)) * pw : 0);
    const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ph;
    svg.setAttribute("viewBox", `0 0 ${W} ${height}`);
    svg.setAttribute("height", String(height));
    svg.replaceChildren();
    const grid = el("g", { class: "bx-grid" });
    const ax = el("g", { class: "bx-axis" });
    const ys = niceStep(hi - lo, 4);
    for (let v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
      grid.appendChild(el("line", { x1: 0, x2: pw, y1: Y(v), y2: Y(v) }));
      const tx = el("text", { x: W - 4, y: Y(v) + 4, "text-anchor": "end" });
      tx.textContent = num(v, v >= 1000 ? 0 : 2);
      ax.appendChild(tx);
    }
    const nt = Math.max(2, Math.floor(pw / 100));
    let last = "";
    for (let k = 0; k <= nt; k++) {
      const i = Math.round((k / nt) * (n - 1));
      const lbl = n > 400 ? t[i].slice(0, 4) : monthYear(t[i]);
      if (lbl === last) continue;
      last = lbl;
      const tx = el("text", { x: X(i), y: height - 5, "text-anchor": k === 0 ? "start" : k === nt ? "end" : "middle" });
      tx.textContent = lbl;
      ax.appendChild(tx);
    }
    svg.append(grid);
    for (const s of series) {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
      svg.appendChild(el("path", { d, class: s.cls }));
    }
    if (hover != null) {
      svg.appendChild(el("line", { class: "bx-x", x1: X(hover), x2: X(hover), y1: T, y2: T + ph }));
      for (const s of series) svg.appendChild(el("circle", { class: "bx-x-dot", cx: X(hover), cy: Y(s.values[hover]), r: 3.5 }));
    }
    svg.appendChild(ax);
    readout();
  };
  plot.addEventListener("pointermove", (e) => {
    const r = plot.getBoundingClientRect();
    const pw = plot.clientWidth - R;
    hover = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / pw) * (n - 1))));
    render();
  });
  plot.addEventListener("pointerleave", () => {
    hover = null;
    render();
  });
  if (window.ResizeObserver) new ResizeObserver(render).observe(plot);
  render();
}
