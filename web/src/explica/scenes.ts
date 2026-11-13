// Siluetas de las escenas del viaje, en SVG. Solo forma: los colores salen de las variables CSS
// de cada escena (style.css), así la misma silueta sirve al amanecer y de noche.

/** Plataforma petrolífera del Mar del Norte. La base de las patas (y = 260) va en la superficie
 *  del agua; la antorcha lleva la luz de sodio. */
export function platform(): string {
  return `<svg class="platform" viewBox="0 0 220 300" aria-hidden="true">
  <g class="steel">
    <path d="M52 300 L66 150 L76 150 L66 300Z M150 300 L140 150 L150 150 L164 300Z
             M96 300 L100 150 L110 150 L112 300Z"/>
    <path d="M60 228 L156 228 L157 236 L59 236Z M64 190 L152 190 L153 197 L63 197Z"/>
    <path d="M38 140 L182 140 L182 156 L38 156Z M46 116 L170 116 L170 140 L46 140Z"/>
    <path d="M60 116 L60 92 L104 92 L104 116Z M128 116 L128 100 L160 100 L160 116Z"/>
    <path d="M114 116 L124 22 L134 116Z" class="derrick"/>
    <path d="M118 80 L130 80 M116 98 L132 98 M120 60 L128 60 M122 42 L126 42" class="lattice"/>
    <path d="M170 124 L214 66 L218 69 L176 128Z"/>
    <path d="M46 116 L18 74 L22 71 L52 112Z"/>
  </g>
  <path class="flare" d="M216 64 C 209 56 212 46 217 38 C 218 46 225 50 222 60 C 221 63 219 64 216 64Z"/>
</svg>`;
}

/** Nubes bajas: elipses alargadas y difusas, repartidas a lo ancho de `w`. */
export function clouds(w: number, h: number, n: number, seed = 7): string {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const items: string[] = [];
  for (let i = 0; i < n; i++) {
    const cx = ((i + rnd() * 0.8) / n) * w;
    const cy = h * (0.08 + rnd() * 0.22);
    const rx = 60 + rnd() * 140;
    const ry = 6 + rnd() * 10;
    items.push(`<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}"/>`);
  }
  return `<svg class="clouds" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
  <defs><filter id="blur-cloud"><feGaussianBlur stdDeviation="6"/></filter></defs>
  <g filter="url(#blur-cloud)">${items.join("")}</g></svg>`;
}

/** Oleaje cercano: una banda ondulada en primer plano (decorativa, no son datos). */
export function swell(w: number, h: number, waves: number): string {
  const amp = h * 0.18;
  const step = w / waves;
  let d = `M0,${h * 0.5}`;
  for (let i = 0; i < waves; i++) {
    const x = i * step;
    d += ` C${x + step * 0.3},${h * 0.5 - amp} ${x + step * 0.7},${h * 0.5 + amp} ${x + step},${h * 0.5}`;
  }
  d += ` L${w},${h} L0,${h} Z`;
  return `<svg class="swell" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
}
