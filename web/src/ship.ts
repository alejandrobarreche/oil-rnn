// Petrolero en foto: vacío (franja roja a la vista) y cargado (hundido), en tema claro y oscuro.
// Las cuatro fotos comparten encuadre, así que cargar es un fundido de una a otra; la eslora
// por barriles se muestra escalando la foto entera.

const MAX_L = 330; // eslora de un VLCC, la mayor de la mesa (desk.ts)
const MIN_SCALE = 0.6;

const PHOTOS = [
  { src: "img/barco-vacio-claro.jpg", cls: "empty light" },
  { src: "img/barco-cargado-claro.jpg", cls: "full light" },
  // Falta la foto del barco vacío en oscuro: hasta tenerla, la clara oscurecida por CSS
  { src: "img/barco-vacio-claro.jpg", cls: "empty dark stand-in" },
  { src: "img/barco-cargado-oscuro.jpg", cls: "full dark" },
];

export function createShip() {
  const el = document.createElement("div");
  el.className = "ship";
  el.setAttribute("aria-hidden", "true");
  const frame = document.createElement("div");
  frame.className = "ship-frame";
  frame.innerHTML = PHOTOS.map((p) => `<img class="${p.cls}" src="${p.src}" alt="" decoding="async" />`).join("");
  el.appendChild(frame);
  el.dataset.full = "false";

  return {
    el,
    /** Eslora en metros: escala la foto respecto al mayor petrolero. */
    size(lengthMeters: number) {
      const k = Math.max(MIN_SCALE, Math.min(1, lengthMeters / MAX_L));
      frame.style.setProperty("--k", k.toFixed(3));
    },
    /** Lleno o vacío: funde a la foto con el barco hundido. */
    load(full: boolean) {
      el.dataset.full = String(full);
    },
    /** El tema lo resuelve el CSS; se mantiene para no cambiar main.ts. */
    theme() {},
  };
}
