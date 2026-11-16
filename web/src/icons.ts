// Iconos del producto: SVG dibujados con el mismo trazo (1,6 px, extremos redondeados). Cada uno lleva
// clases en sus partes para animarse al pulsar o al pasar por encima (product.css).
const svg = (body: string, cls = "") =>
  `<svg class="ic ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Abanico que se abre más cuanto más lejos está el plazo: `spread` de 0 a 1. */
export const fan = (spread: number) => {
  const a = 3 + spread * 7;
  return svg(
    `<path d="M4 12h3"/><path class="ic-fan" d="M7 12 L20 ${12 - a} M7 12 L20 ${12 + a}"/><path class="ic-fan-mid" d="M7 12h13"/>`,
    "ic-fanwrap",
  );
};

export const now = svg('<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/><circle class="ic-ripple" cx="12" cy="12" r="7.5"/>', "ic-now");

export const past = svg(
  '<g class="ic-hands"><path d="M12 7.5V12l3 2"/></g><path d="M4.6 9.2A8 8 0 1 1 4 12"/><path d="M4 5.5v3.7h3.7"/>',
  "ic-past",
);

export const drop = svg(
  '<path class="ic-drop" d="M12 3.2s-5.6 6.1-5.6 9.9a5.6 5.6 0 0 0 11.2 0c0-3.8-5.6-9.9-5.6-9.9Z"/><path class="ic-shine" d="M9.6 13.6a2.6 2.6 0 0 0 2 2.3"/>',
  "ic-dropwrap",
);

export const eye = svg(
  '<g class="ic-lid"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></g>',
  "ic-eye",
);

export const book = svg(
  '<path d="M12 6.5C10.5 5.3 8.2 4.8 4 5v13c4.2-.2 6.5.3 8 1.5"/><path d="M12 6.5c1.5-1.2 3.8-1.7 8-1.5v13c-4.2-.2-6.5.3-8 1.5"/><path class="ic-page" d="M12 6.5v13"/>',
  "ic-book",
);

export const arrow = svg('<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>', "ic-arrow");

export const trend = (up: boolean) =>
  svg(up ? '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>' : '<path d="M7 7l10 10"/><path d="M17 9v8H9"/>', "ic-trend");

export const check = svg('<path class="ic-draw" d="m5 12.5 4.5 4.5L19 7.5"/>', "ic-check");
export const cross = svg('<path class="ic-draw" d="M6 6l12 12M18 6 6 18"/>', "ic-cross");

export const calendar = svg(
  '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  "ic-cal",
);

export const scale = svg(
  '<path d="M12 4v16M7 20h10"/><path class="ic-beam" d="M4 8h16"/><path d="M4 8l-2.5 6a3 3 0 0 0 5 0L4 8ZM20 8l-2.5 6a3 3 0 0 0 5 0L20 8Z"/>',
  "ic-scale",
);

export const theme = svg(
  '<mask id="moon-cut"><rect width="24" height="24" fill="#fff"/><circle class="ic-moon-cut" cx="17" cy="7" r="5.5" fill="#000"/></mask><circle class="ic-core" cx="12" cy="12" r="5" fill="currentColor" stroke="none" mask="url(#moon-cut)"/><g class="ic-rays"><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>',
  "ic-theme",
);
