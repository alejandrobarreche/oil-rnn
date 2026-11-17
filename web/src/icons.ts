// Iconos del producto: SVG con el mismo trazo (1,6 px, extremos redondeados).
const svg = (body: string, cls = "") =>
  `<svg class="ic ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const arrow = svg('<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>', "ic-arrow");
