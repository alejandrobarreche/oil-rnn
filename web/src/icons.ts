// Iconos del producto: SVG con el mismo trazo (1,6 px, extremos redondeados).
const svg = (body: string, cls = "") =>
  `<svg class="ic ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const arrow = svg('<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>', "ic-arrow");

export const theme = svg(
  '<mask id="moon-cut"><rect width="24" height="24" fill="#fff"/><circle class="ic-moon-cut" cx="17" cy="7" r="5.5" fill="#000"/></mask><circle class="ic-core" cx="12" cy="12" r="5" fill="currentColor" stroke="none" mask="url(#moon-cut)"/><g class="ic-rays"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>',
  "ic-theme",
);
