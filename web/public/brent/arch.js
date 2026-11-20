// Celda recurrente interactiva: RNN, LSTM y GRU leyendo día a día 60 cambios reales del Brent.
// Lo que se ve es un esquema: el grosor de cada puerta y el peso de los días pasados ilustran la
// idea (lo antiguo se diluye en la RNN; LSTM y GRU deciden qué guardar), no son activaciones medidas.
const d3 = window.d3;

const TYPES = {
  rnn: {
    name: "RNN simple",
    keep: 0.7, // cuánto pesa el día anterior en el resumen: con una mezcla simple se diluye rápido
    tex: String.raw`h_t = \tanh\left(W x_t + U h_{t-1} + b\right)`,
    info: "En el proyecto, la red de 1 año: 1 capa de 16 neuronas, 595 parámetros, media de 5; la validación la deja en el precio de hoy.",
    gates: [{ x: 410, y: 280, sym: "tanh", t: "mezcla", a: 0.5, b: 0.2 }],
  },
  lstm: {
    name: "LSTM",
    keep: 0.95,
    tex: String.raw`c_t = f_t \odot c_{t-1} + i_t \odot \tilde c_t \qquad h_t = o_t \odot \tanh(c_t)`,
    info: "En el proyecto, la red de 1 mes: 1 capa de 64 neuronas, 21 187 parámetros.",
    gates: [
      { x: 330, y: 170, sym: "×", t: "olvidar", a: -0.7, b: 1.6 },
      { x: 410, y: 170, sym: "+", t: "añadir", a: 0.9, b: -0.4 },
      { x: 490, y: 280, sym: "σ", t: "sacar", a: 0.4, b: 0.3 },
    ],
  },
  gru: {
    name: "GRU",
    keep: 0.93,
    tex: String.raw`h_t = (1 - z_t) \odot h_{t-1} + z_t \odot \tilde h_t`,
    info: "En el proyecto, las redes de 1 semana y 3 meses; la de 3 meses, 2 capas de 64, 40 899 parámetros, media de 5.",
    gates: [
      { x: 360, y: 280, sym: "σ", t: "reiniciar", a: 0.6, b: 0 },
      { x: 460, y: 280, sym: "σ", t: "actualizar", a: 0.9, b: -0.8 },
    ],
  },
};

export function mountArch(host, C) {
  const { INK, SOFT, SHEEN, ACCENT, CORAL, reduced, katex, days, label } = C;
  const W = 820, H = 490, N = days.length, MEM = 24;
  const tools = host.querySelector(".arch-tools");
  const formula = host.querySelector(".arch-tex");
  const info = host.querySelector(".arch-info");
  const svg = d3.select(host.querySelector(".arch-svg")).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const t = (g, cls, x, y, s, a = "start") => g.append("text").attr("class", cls).attr("x", x).attr("y", y).attr("text-anchor", a).text(s);

  // Memoria: peso de cada uno de los últimos 24 días en el resumen
  const memG = svg.append("g").attr("transform", "translate(290,18)");
  const mw = 240 / MEM;
  const memCells = memG.selectAll("rect").data(d3.range(MEM)).join("rect")
    .attr("x", (i) => i * mw + 1).attr("y", 0).attr("width", mw - 2).attr("height", 26).attr("rx", 3).attr("fill", ACCENT);
  t(memG, "lbl", 0, 46, "hace 24 días");
  t(memG, "lbl", 240, 46, "hoy", "end");
  t(memG, "cap", -14, 18, "Lo que pesa cada día", "end");

  // Celdas vecinas y la celda de hoy
  const box = svg.append("g");
  [[60, 200, 0.3], [290, 530, 1], [620, 760, 0.3]].forEach(([a, b, o]) =>
    box.append("rect").attr("x", a).attr("y", 120).attr("width", b - a).attr("height", 220).attr("rx", 22)
      .attr("fill", "#232327").attr("stroke", SHEEN).attr("stroke-opacity", 0.5 * o + 0.1).attr("opacity", o));
  const title = t(box, "cap-big", 410, 148, "", "middle");

  // Resumen (estado oculto) y memoria aparte de la LSTM
  const wire = (y, c) => {
    const g = svg.append("g");
    g.append("line").attr("x1", 20).attr("x2", 800).attr("y1", y).attr("y2", y).attr("stroke", c).attr("stroke-opacity", 0.35).attr("stroke-width", 2);
    const pulse = g.append("circle").attr("r", 6).attr("cy", y).attr("cx", 530).attr("fill", c).attr("opacity", 0);
    return { g, pulse };
  };
  const hW = wire(230, ACCENT), cW = wire(170, SHEEN);
  t(hW.g, "cap", 210, 220, "resumen", "end").style("fill", ACCENT);
  const cLab = t(cW.g, "cap", 210, 160, "memoria", "end").style("fill", SHEEN);

  const gatesG = svg.append("g");

  // Entrada del día: 16 números, el primero es el cambio real del Brent
  const inG = svg.append("g").attr("transform", "translate(402,356)");
  const col = inG.append("g");
  for (let i = 0; i < 16; i++) col.append("rect").attr("x", (i % 4) * 5).attr("y", Math.floor(i / 4) * 5).attr("width", 4).attr("height", 4).attr("rx", 1)
    .attr("fill", i === 0 ? INK : SOFT).attr("opacity", i === 0 ? 1 : 0.35);
  svg.append("line").attr("x1", 410).attr("x2", 410).attr("y1", 352).attr("y2", 344).attr("stroke", SOFT).attr("stroke-width", 1.6);
  t(svg, "lbl", 432, 372, "16 números del día");

  // La secuencia: 60 cambios diarios reales del Brent y el día que se lee
  const sx = d3.scaleLinear().domain([0, N - 1]).range([40, 780]);
  const sy = d3.scaleLinear().domain([-8, 8]).range([30, -30]).clamp(true);
  const seq = svg.append("g").attr("transform", `translate(0,${H - 46})`);
  seq.append("line").attr("x1", 36).attr("x2", 784).attr("stroke", "rgba(238,240,242,.15)");
  const bars = seq.selectAll("line.d").data(days).join("line").attr("class", "d")
    .attr("x1", (_, i) => sx(i)).attr("x2", (_, i) => sx(i)).attr("y1", 0).attr("y2", (v) => sy(v))
    .attr("stroke", (v) => (v >= 0 ? SHEEN : CORAL)).attr("stroke-width", 6).attr("stroke-linecap", "round").attr("opacity", 0.25);
  const cursor = seq.append("rect").attr("y", -36).attr("height", 72).attr("width", 14).attr("rx", 7).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.4);
  t(seq, "lbl", 36, 52, label);

  let type = "gru", i = 0, mem = new Array(MEM).fill(0), playing = !reduced, gates = [];

  function drawType() {
    const T = TYPES[type];
    title.text(T.name);
    cW.g.attr("opacity", type === "lstm" ? 1 : 0);
    cLab.attr("opacity", type === "lstm" ? 1 : 0);
    gatesG.selectAll("*").remove();
    gates = T.gates.map((g) => {
      const G = gatesG.append("g").attr("transform", `translate(${g.x},${g.y})`);
      if (type === "lstm" && g.y === 170) G.append("line").attr("y1", 0).attr("y2", 60).attr("stroke", INK).attr("stroke-opacity", 0.3);
      if (type === "lstm" && g.y === 280) G.append("line").attr("y1", -50).attr("y2", -110).attr("stroke", INK).attr("stroke-opacity", 0.3);
      const fill = G.append("circle").attr("r", 23).attr("fill", ACCENT).attr("opacity", 0.2);
      G.append("circle").attr("r", 23).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 1.4);
      t(G, "cap", 0, 5, g.sym, "middle");
      t(G, "lbl", 0, 44, g.t, "middle");
      return { g, fill };
    });
    katex.render(T.tex, formula, { displayMode: true, throwOnError: false });
    info.textContent = T.info;
    tools.querySelectorAll("[data-net]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.net === type)));
    // Se rellena la memoria con los días ya leídos, para que la diferencia entre redes se vea al cambiar
    mem = new Array(MEM).fill(0);
    for (let k = 0; k < MEM; k++) mem = mem.slice(1).map((m) => m * TYPES[type].keep).concat(1);
    paint(0);
  }

  function paint(dur) {
    const z = days[i] / 2.29; // cambio del día en desviaciones típicas
    cursor.transition().duration(dur).attr("x", sx(i) - 7);
    bars.attr("opacity", (_, j) => (j === i ? 1 : j < i ? 0.55 : 0.2));
    col.select("rect").attr("fill", z >= 0 ? SHEEN : CORAL);
    gates.forEach(({ g, fill }) => {
      const v = 1 / (1 + Math.exp(-(g.a * Math.abs(z) + g.b))); // apertura ilustrativa de la puerta
      fill.transition().duration(dur).attr("opacity", 0.12 + 0.85 * v).attr("r", 10 + 13 * v);
    });
    memCells.transition().duration(dur).attr("opacity", (k) => 0.06 + 0.94 * mem[k]);
    if (dur) {
      [hW, type === "lstm" ? cW : null].forEach((w) => w && w.pulse.interrupt().attr("cx", 530).attr("opacity", 1)
        .transition().duration(dur * 1.4).ease(d3.easeCubicOut).attr("cx", 640).attr("opacity", 0));
    }
  }

  function step() {
    i = (i + 1) % N;
    const keep = TYPES[type].keep;
    mem = mem.slice(1).map((m) => m * keep).concat(1);
    paint(reduced ? 0 : 420);
  }

  const playBtn = tools.querySelector("[data-act=play]");
  const setPlay = (p) => {
    playing = p;
    playBtn.setAttribute("aria-pressed", String(p));
    playBtn.querySelector("span").textContent = p ? "Pausa" : "Reproducir";
  };
  tools.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.net) set(b.dataset.net);
    if (b.dataset.act === "play") setPlay(!playing);
    if (b.dataset.act === "step") { setPlay(false); step(); }
  });

  // Solo avanza cuando la celda está a la vista
  const visible = () => host.closest(".layer")?.classList.contains("is-on") && host.offsetParent !== null;
  d3.interval(() => { if (playing && visible()) step(); }, 700);

  function set(k) { if (TYPES[k] && k !== type) { type = k; drawType(); } }
  drawType();
  setPlay(playing);
  return { set };
}
