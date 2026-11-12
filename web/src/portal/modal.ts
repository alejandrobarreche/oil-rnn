// Recuadro modal sobre <dialog> nativo: atrapa el foco, se cierra con Esc o pulsando fuera, y su
// ::backdrop deja la página opacada (estilos en style.css). Un único diálogo para todo el portal.
import { esc, type Html } from "../sonda";

export interface ModalAction {
  label: string;
  primary?: boolean;
  /** Devuelve false para dejar el recuadro abierto (p. ej. un error de validación). */
  run?: (body: HTMLElement) => boolean | undefined | Promise<boolean | undefined>;
}
export interface ModalOptions {
  title: string;
  body: Html;
  actions?: ModalAction[];
  wide?: boolean;
  onMount?: (body: HTMLElement) => void;
}

const CLOSE_ICON =
  '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

let actions: ModalAction[] = [];

function dialog(): HTMLDialogElement {
  let d = document.getElementById("modal") as HTMLDialogElement | null;
  if (d) return d;
  d = document.createElement("dialog");
  d.id = "modal";
  d.className = "modal bx-root";
  d.setAttribute("aria-labelledby", "modal-t");
  d.innerHTML = `<div class="modal-h"><h2 id="modal-t"></h2><button type="button" class="bx-iconbtn modal-x" data-close aria-label="Cerrar">${CLOSE_ICON}</button></div>
    <div class="modal-b"></div><div class="modal-f"></div>`;
  document.body.appendChild(d);
  // Enter en un campo ejecuta la acción principal
  d.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName !== "INPUT") return;
    e.preventDefault();
    d.querySelector<HTMLElement>(".modal-f .btn-primary")?.click();
  });
  // Pulsar en el fondo (fuera de la caja) cierra
  d.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t === d || t.closest("[data-close]")) return closeModal();
    const b = t.closest<HTMLElement>("[data-modal-act]");
    if (!b) return;
    const a = actions[Number(b.dataset.modalAct)];
    const body = d.querySelector(".modal-b") as HTMLElement;
    const keep = a?.run ? await a.run(body) : undefined;
    if (keep !== false && d.querySelector(".modal-b") === body && actions.includes(a)) closeModal();
  });
  return d;
}

/** Abre el recuadro o, si ya está abierto, sustituye su contenido (un formulario que pasa a resultado). */
export function openModal(o: ModalOptions): void {
  const d = dialog();
  actions = o.actions ?? [{ label: "Cerrar", primary: true }];
  d.classList.toggle("is-wide", !!o.wide);
  (d.querySelector("#modal-t") as HTMLElement).textContent = o.title;
  const old = d.querySelector(".modal-b") as HTMLElement;
  const body = old.cloneNode(false) as HTMLElement; // nuevo nodo: invalida acciones del contenido anterior
  body.innerHTML = o.body;
  old.replaceWith(body);
  (d.querySelector(".modal-f") as HTMLElement).innerHTML = actions
    .map(
      (a, i) =>
        `<button type="button" class="bx-pill ${a.primary ? "btn-primary" : "bx-pill-solid"}" data-modal-act="${i}">${esc(a.label)}</button>`,
    )
    .join("");
  if (!d.open) d.showModal();
  o.onMount?.(body);
  const first = body.querySelector<HTMLElement>("input, select, textarea");
  (first ?? d.querySelector<HTMLElement>(".modal-f .btn-primary"))?.focus();
}

export function closeModal(): void {
  const d = document.getElementById("modal") as HTMLDialogElement | null;
  if (d?.open) d.close();
}

/** Muestra un error de validación dentro del recuadro, en el elemento [data-error]. */
export function showError(body: HTMLElement, msg: string): false {
  const e = body.querySelector<HTMLElement>("[data-error]");
  if (e) e.textContent = msg;
  return false;
}
