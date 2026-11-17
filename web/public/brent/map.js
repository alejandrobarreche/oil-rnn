// Mapa de los mercados de los que sale cada serie de entrada. Las líneas llevan cada dato al Brent,
// la serie que se predice. Al elegir un mercado, su tarjeta enseña la serie mensual real (data.json).
const d3 = window.d3;
const TOPO = "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
const WORLD = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";

// Plaza de cotización o de publicación de cada serie (config.yaml: EIA, FRED y Yahoo Finance)
const MARKETS = [
  { id: "brent", name: "Mar del Norte", what: "Brent, la serie que se predice", keys: ["brent"], at: [1.7, 61], dx: 14, dy: -12, a: "start", target: true },
  { id: "cushing", name: "Cushing", what: "WTI, la referencia de Estados Unidos", keys: ["wti"], at: [-96.8, 36], dx: -12, dy: -10, a: "end" },
  { id: "ny", name: "Nueva York", what: "Futuro del WTI, oro, cobre e índice del dólar", keys: ["wti_fut_close", "gold", "copper", "dollar_index"], at: [-74, 40.7], dx: 12, dy: 18, a: "start" },
  { id: "hh", name: "Henry Hub", what: "Gas natural, sustituto del crudo", keys: ["henry_hub"], at: [-92.1, 30], dx: -10, dy: 22, a: "end" },
  { id: "chi", name: "Chicago", what: "VIX, el miedo en los mercados", keys: ["vix"], at: [-87.6, 41.9], dx: -6, dy: -16, a: "middle" },
  { id: "fra", name: "Fráncfort", what: "Euro y tipo de depósito del BCE", keys: ["usd_per_eur", "ecb_deposit_rate"], at: [8.7, 50.1], dx: 12, dy: 20, a: "start" },
  { id: "cn", name: "China", what: "Yuanes por dólar", keys: ["cny_per_usd"], at: [116.4, 39.9], dx: 0, dy: -16, a: "middle" },
];
const NAMES = {
  brent: "Brent", wti: "WTI", wti_fut_close: "Futuro WTI, cierre", gold: "Oro", copper: "Cobre", dollar_index: "Índice del dólar",
  henry_hub: "Gas natural", vix: "VIX", usd_per_eur: "Dólares por euro", ecb_deposit_rate: "Depósito del BCE", cny_per_usd: "Yuanes por dólar",
};

export async function mountMap(host, card, C) {
  const { DATA, INK, SOFT, SHEEN, reduced } = C;
  const W = 820, H = 470;
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const proj = d3.geoNaturalEarth1().rotate([-10, 0])
    .fitExtent([[0, 0], [W, H]], { type: "MultiPoint", coordinates: [[-122, 16], [128, 16], [-122, 66], [128, 66]] });
  const path = d3.geoPath(proj);

  const land = svg.append("g");
  const arcs = svg.append("g");
  const pins = svg.append("g");
  try {
    const [topo, world] = await Promise.all([import(TOPO), fetch(WORLD).then((r) => r.json())]);
    land.selectAll("path").data(topo.feature(world, world.objects.countries).features).join("path")
      .attr("d", path).attr("fill", "#2a2a30").attr("stroke", "#1c1c1f").attr("stroke-width", 0.6);
  } catch {
    // Sin conexión al CDN: quedan los puntos y las líneas, que son lo que importa
  }

  const brent = MARKETS[0].at;
  // Cada línea: un trazo tenue fijo y, encima, guiones que avanzan hacia el Brent
  const arcSel = arcs.selectAll("g").data(MARKETS.slice(1)).join("g").attr("opacity", 0);
  arcSel.append("path").attr("d", (m) => path({ type: "LineString", coordinates: [m.at, brent] }))
    .attr("fill", "none").attr("stroke", SHEEN).attr("stroke-width", 1.2).attr("stroke-opacity", 0.35);
  arcSel.append("path").attr("d", (m) => path({ type: "LineString", coordinates: [m.at, brent] }))
    .attr("fill", "none").attr("stroke", SHEEN).attr("stroke-width", 2.4).attr("stroke-linecap", "round").attr("class", "flow");

  const pin = pins.selectAll("g").data(MARKETS).join("g")
    .attr("transform", (m) => `translate(${proj(m.at)})`).attr("tabindex", 0).attr("role", "button")
    .attr("aria-label", (m) => `${m.name}: ${m.what}`).style("cursor", "pointer").attr("class", "pin");
  pin.append("circle").attr("r", 22).attr("fill", "transparent"); // objetivo táctil de 44 px
  pin.filter((m) => m.target).append("circle").attr("class", "pulse").attr("r", 10).attr("fill", "none").attr("stroke", INK);
  pin.append("circle").attr("class", "dot").attr("r", (m) => (m.target ? 8 : 6)).attr("fill", (m) => (m.target ? INK : SHEEN))
    .attr("stroke", "#1c1c1f").attr("stroke-width", 2);
  pin.append("text").attr("class", "pin-l").attr("x", (m) => m.dx).attr("y", (m) => m.dy).attr("text-anchor", (m) => m.a).text((m) => m.name);

  // Tarjeta: nombre, qué serie sale de ahí y su serie de 2000 a 2026, un punto por mes
  function show(m) {
    const spark = (k) => {
      const v = DATA.series[k], ok = v.filter((z) => z != null);
      const x = d3.scaleLinear().domain([0, v.length - 1]).range([2, 178]);
      const y = d3.scaleLinear().domain(d3.extent(ok)).range([34, 4]);
      const d = d3.line().defined((z) => z != null).x((_, i) => x(i)).y((z) => y(z))(v);
      return `<div class="mc-row"><span>${NAMES[k]}</span><svg viewBox="0 0 180 38" aria-hidden="true"><path d="${d}" fill="none" stroke="${k === "brent" ? INK : SHEEN}" stroke-width="1.5"/></svg></div>`;
    };
    card.innerHTML = `<p class="mc-name">${m.name}</p><p class="mc-what">${m.what}</p>${m.keys.map(spark).join("")}`;
    pin.attr("aria-pressed", (p) => String(p === m));
    pin.select(".dot").transition().duration(reduced ? 0 : 200).attr("r", (p) => (p === m ? (p.target ? 10 : 8) : p.target ? 8 : 6));
    arcSel.transition().duration(reduced ? 0 : 300).attr("opacity", (a) => (m.target ? 0.8 : a === m ? 1 : 0.15));
  }
  pin.on("click", (_, m) => show(m)).on("keydown", (e, m) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(m); }
  });

  return {
    focus(id) { show(MARKETS.find((m) => m.id === id)); },
    all() {
      show(MARKETS[0]);
      arcSel.interrupt().attr("opacity", 0).transition().delay((_, i) => (reduced ? 0 : i * 140)).duration(reduced ? 0 : 500).attr("opacity", 0.8);
    },
    dim() { show(MARKETS[0]); arcSel.interrupt().attr("opacity", 0.1); },
  };
}
