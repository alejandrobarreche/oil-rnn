// Página explicativa: el viaje de un barril de Brent. Lee market.json (histórico y sucesos, de
// make export-web) y explain.json (make export-explain); no calcula ninguna cifra nueva.
// El parallax va en CSS (animaciones ligadas al scroll); aquí solo se construye el DOM y, si el
// navegador no las admite, se mueve cada capa con un respaldo en JavaScript.
import "./style.css";
import { clouds, platform, swell } from "./scenes";
import { decimate, frameFor, type Point, progressOf, type SeaFrame, seaPaths, xOf, yearTicks, yOf } from "./sea";

interface CycleEvent {
  t: string;
  price: number;
  label: string;
  text: string;
  kind: "max" | "min";
}
interface Market {
  ts: string;
  history: Point[];
  events: CycleEvent[];
}

const STOPS = [
  { id: "plataforma", name: "Plataforma" },
  { id: "petrolero", name: "Petrolero" },
  { id: "control", name: "Sala de control" },
  { id: "puerto", name: "Puerto" },
  { id: "faro", name: "Faro" },
];
const SEA_W = 2000; // viewBox del mar; se estira al ancho de su capa
const SEA_H = 1000;
const PRICE_MAX = 160; // $ del borde superior del eje (máximo de la serie: 143,95 $)
const PAN = 4; // capítulo 1: anchos de pantalla que recorre la cámara sobre el mar

const base = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-explain\`.`);
  return res.json() as Promise<T>;
}

const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const dollars = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: 2 })} $`;

function seaSvg(points: Point[], f: SeaFrame, id: string): string {
  const { line, water } = seaPaths(points, f, SEA_W, SEA_H);
  return `<svg class="sea" viewBox="0 0 ${SEA_W} ${SEA_H}" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.35" class="water-top"/><stop offset="1" class="water-deep"/>
  </linearGradient></defs>
  <path class="water" d="${water}" fill="url(#${id})"/>
  <path class="surface" d="${line}" vector-effect="non-scaling-stroke"/>
</svg>`;
}

/** Precio (interpolado) de la serie en una fecha. */
function priceAt(points: Point[], iso: string): number {
  const i = points.findIndex((p) => p.t >= iso);
  return points[Math.max(0, i)].close;
}

// ── Portada ──────────────────────────────────────────────
function hero(m: Market): string {
  const pts = decimate(m.history, 3);
  const f = frameFor(pts, 0.02, 0.62, 0.995, PRICE_MAX);
  const spot = "2023-10-02"; // la plataforma, sobre la meseta de 2023, a la derecha del texto
  const px = xOf(spot, f) * 100;
  const py = yOf(priceAt(pts, spot), f) * 100;
  return `<header class="hero scene dawn" id="inicio">
  <div class="sky"></div>
  <div class="layer far" data-depth="far">${clouds(2000, 500, 8)}</div>
  <div class="platform-at after-reveal" style="left:${px}%;top:${py}%">${platform()}</div>
  <div class="layer sea-layer reveal">${seaSvg(pts, f, "water-hero")}</div>
  <div class="hero-copy">
    <h1>Lo que el precio de hoy ya sabe</h1>
    <p class="lead">Tres redes neuronales intentaron predecir el precio del petróleo Brent. Este viaje
    cuenta cómo se hizo y por qué, casi siempre, la mejor previsión fue la más sencilla: que dentro
    de unos días el barril cueste lo mismo que hoy.</p>
    <p class="cue">Baja para empezar el viaje</p>
  </div>
</header>`;
}

// ── Capítulo 1: la serie y su ciclo ───────────────────────
interface Step {
  at: number; // 0–1 del recorrido: el texto queda centrado cuando la cámara llega aquí
  title: string;
  body: string;
}

function platformSteps(m: Market, f: SeaFrame): Step[] {
  const h = m.history;
  const lo = h.reduce((a, b) => (b.close < a.close ? b : a));
  const hi = h.reduce((a, b) => (b.close > a.close ? b : a));
  const steps: Step[] = [
    {
      at: 0,
      title: "El mar es el precio",
      body: `<p>El Brent es el crudo del Mar del Norte y el precio de referencia del petróleo en Europa.
      La línea de las olas es su precio de cada día, del ${longDate(h[0].t)} al ${longDate(m.ts)}.</p>
      <p>En ese tiempo el barril ha costado desde ${dollars(lo.close)} (${longDate(lo.t)}) hasta
      ${dollars(hi.close)} (${longDate(hi.t)}). Cada boya marca uno de los grandes movimientos.</p>`,
    },
  ];
  // Sucesos del mismo año: un solo texto (los dos de 2008 están a menos de seis meses)
  const byYear = new Map<string, CycleEvent[]>();
  for (const e of m.events) byYear.set(e.t.slice(0, 4), [...(byYear.get(e.t.slice(0, 4)) ?? []), e]);
  const years = [...byYear.keys()];
  years.forEach((year, i) => {
    const group = byYear.get(year) as CycleEvent[];
    const one = group[0].label;
    const title =
      group.length > 1 ? `${year}: del máximo al desplome` : one.includes(year) ? one : `${year}: ${one[0].toLowerCase()}${one.slice(1)}`;
    const parts = group.map(
      (e) => `<p><strong>${longDate(e.t)}, ${dollars(e.price)}.</strong> ${e.text}</p>`,
    );
    if (i === years.length - 1) {
      parts.push(`<p>Subidas lentas, caídas bruscas y saltos de un año a otro. Predecir
      el tramo siguiente de este mar es el reto del viaje.</p>`);
    }
    const at = group.reduce((s, e) => s + progressOf(e.t, f), 0) / group.length;
    steps.push({ at, title, body: parts.join("") });
  });
  return steps;
}

function chapterPlatform(m: Market): string {
  const pts = decimate(m.history, 2);
  const f = frameFor(pts, 0.5 / (PAN + 1), 0.4, 0.95, PRICE_MAX);
  const buoys = m.events
    .map(
      (e) => `<div class="buoy ${e.kind}" style="left:${xOf(e.t, f) * 100}%;top:${yOf(e.price, f) * 100}%">
      <span class="buoy-mark"></span><span class="buoy-tag">${e.t.slice(0, 4)}</span></div>`,
    )
    .join("");
  const years = yearTicks(f, 2)
    .map((y) => `<span class="year" style="left:${y.x * 100}%">${y.year}</span>`)
    .join("");
  const guides = [50, 100, 150]
    .map((p) => `<div class="guide" style="top:${yOf(p, f) * 100}%"><span>${p} $</span></div>`)
    .join("");
  const steps = platformSteps(m, f)
    .map((s) => `<article class="step" style="--at:${s.at.toFixed(4)}"><h3>${s.title}</h3>${s.body}</article>`)
    .join("");
  return `<section class="chapter scene dawn" id="plataforma" style="--pan:${PAN}" aria-labelledby="t-plataforma">
  <div class="stage">
    <div class="sky"></div>
    <div class="layer far" data-travel="0.22" style="--travel:0.22">${clouds(4000, 500, 22, 11)}</div>
    <div class="layer pan" data-travel="1" style="--travel:1">
      <div class="platform-at small" style="left:${xOf(pts[0].t, f) * 100 - 1.2}%;top:${yOf(pts[0].close, f) * 100}%">${platform()}</div>
      ${seaSvg(pts, f, "water-ch1")}
      ${buoys}
      <div class="years">${years}</div>
    </div>
    <div class="guides">${guides}</div>
    <div class="layer near" data-travel="1.35" style="--travel:1.35">${swell(4000, 120, 46)}</div>
    <h2 class="chapter-title" id="t-plataforma">La plataforma</h2>
  </div>
  <div class="steps">${steps}</div>
</section>`;
}

// ── Recorrido (barra superior) ────────────────────────────
function route(built: Set<string>): void {
  $("#route").innerHTML = STOPS.map((s) =>
    built.has(s.id)
      ? `<li><a href="#${s.id}" data-stop="${s.id}">${s.name}</a></li>`
      : `<li><span class="route-later" title="En construcción">${s.name}</span></li>`,
  ).join("");
  const links = new Map([...document.querySelectorAll<HTMLAnchorElement>("[data-stop]")].map((a) => [a.dataset.stop, a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const link = links.get(e.target.id);
        if (!link) continue;
        if (e.isIntersecting) link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-50% 0px -50% 0px" },
  );
  for (const id of built) io.observe(document.getElementById(id) as HTMLElement);
}

// ── Respaldo del parallax sin animaciones ligadas al scroll ──
function scrollFallback(): void {
  const supported = CSS.supports("(animation-timeline: view()) and (animation-range: entry)");
  if (supported || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
  const update = () => {
    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      const pan = Number(getComputedStyle(ch).getPropertyValue("--pan")) || 0;
      const width = ch.clientWidth;
      for (const layer of ch.querySelectorAll<HTMLElement>("[data-travel]")) {
        layer.style.translate = `${-p * pan * Number(layer.dataset.travel) * width}px 0`;
      }
    }
  };
  addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  addEventListener("resize", update);
  update();
}

async function main(): Promise<void> {
  const market = await loadJson<Market>("data/market.json");
  const view = $("#viaje");
  view.innerHTML = hero(market) + chapterPlatform(market);
  route(new Set(["plataforma"]));
  scrollFallback();
}

main().catch((err: Error) => {
  $("#loading").textContent = `No se ha podido preparar el viaje: ${err.message}`;
});
