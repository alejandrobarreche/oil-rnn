// El mar de la página explicativa: la serie diaria del Brent convertida en el perfil de las olas.
// Funciones puras (sin DOM) para poder probarlas: fechas → posición horizontal, precio → altura,
// y el trazado SVG de la superficie y del agua.

export interface Point {
  t: string; // fecha ISO (AAAA-MM-DD)
  close: number; // $/barril
}

export interface SeaFrame {
  start: number; // ms de la primera fecha
  end: number; // ms de la última fecha
  pad: number; // fracción del ancho, a cada lado, sin datos (mar en calma)
  top: number; // altura (0–1 desde arriba) del precio máximo del eje
  bottom: number; // altura (0–1 desde arriba) de 0 $
  max: number; // $ del borde superior del eje
}

const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

/** Un punto de cada `every` días de cotización, conservando siempre el primero, el último y
 *  los extremos de cada tramo (para que no desaparezcan picos como el de 2008). */
export function decimate(points: Point[], every: number): Point[] {
  if (every <= 1 || points.length <= 2) return points.slice();
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += every) {
    const chunk = points.slice(i, Math.min(i + every, points.length - 1));
    let lo = chunk[0];
    let hi = chunk[0];
    for (const p of chunk) {
      if (p.close < lo.close) lo = p;
      if (p.close > hi.close) hi = p;
    }
    const pair = ms(lo.t) <= ms(hi.t) ? [lo, hi] : [hi, lo];
    for (const p of pair) if (out[out.length - 1] !== p) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Posición horizontal (0–1 del ancho total) de una fecha. Las fechas fuera del tramo se
 *  quedan en el margen. */
export function xOf(iso: string, f: SeaFrame): number {
  const k = Math.min(1, Math.max(0, (ms(iso) - f.start) / (f.end - f.start)));
  return f.pad + k * (1 - 2 * f.pad);
}

/** Fracción del tramo (0 = primera fecha, 1 = última) en que cae una fecha. */
export function progressOf(iso: string, f: SeaFrame): number {
  return Math.min(1, Math.max(0, (ms(iso) - f.start) / (f.end - f.start)));
}

/** Altura (0–1 desde arriba) de un precio. */
export function yOf(price: number, f: SeaFrame): number {
  return f.bottom - (price / f.max) * (f.bottom - f.top);
}

export function frameFor(points: Point[], pad: number, top: number, bottom: number, max: number): SeaFrame {
  return { start: ms(points[0].t), end: ms(points[points.length - 1].t), pad, top, bottom, max };
}

/** Trazado SVG en un viewBox de `w` × `h`: `line`, la superficie (empieza y acaba en calma en
 *  los márgenes), y `water`, el agua bajo ella hasta el fondo. */
export function seaPaths(points: Point[], f: SeaFrame, w: number, h: number): { line: string; water: string } {
  const r = (v: number) => Math.round(v * 10) / 10;
  const xy = points.map((p) => [r(xOf(p.t, f) * w), r(yOf(p.close, f) * h)]);
  const first = xy[0];
  const last = xy[xy.length - 1];
  const body = xy.map(([x, y]) => `${x},${y}`).join(" L");
  const line = `M0,${first[1]} L${body} L${w},${last[1]}`;
  return { line, water: `${line} L${w},${h} L0,${h} Z` };
}

/** Marcas de año (1 de enero) dentro del tramo, cada `step` años. */
export function yearTicks(f: SeaFrame, step: number): { year: number; x: number }[] {
  const out: { year: number; x: number }[] = [];
  const y0 = new Date(f.start).getUTCFullYear() + 1;
  const y1 = new Date(f.end).getUTCFullYear();
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push({ year: y, x: xOf(`${y}-01-01`, f) });
  return out;
}
