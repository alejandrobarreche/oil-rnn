// Escena 3D del producto: el precio real como una lámina en relieve, la previsión como un volumen
// que se abre desde hoy hasta la fecha objetivo (el rango del 80 % crece con el plazo) y una gota de
// crudo que recorre la mediana al prever. En «Un día pasado», el precio real que llegó después se
// dibuja encima para compararlo. Three.js se carga de jsDelivr (mapa de importación en index.html);
// si no carga, queda un gráfico SVG plano con los mismos datos.
//
// Todas las transiciones son muelles críticamente amortiguados que parten del valor que hay en
// pantalla: un cambio a mitad de animación redirige el movimiento sin saltos.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StageEvent {
  t: string;
  label: string;
}
export interface StageData {
  /** Fechas y precios visibles hasta el día de partida, incluido. */
  t: string[];
  v: number[];
  /** Precios reales después del día de partida, hasta la fecha objetivo (solo en «Un día pasado»). */
  future: number[];
  /** Días hábiles hasta la fecha objetivo y su fecha. */
  h: number;
  target: string;
  /** Previsión (null hasta pulsar «Prever»). */
  fc: { lo: number; mid: number; hi: number } | null;
  revealed: boolean;
  events: StageEvent[];
  fmt: (v: number) => string;
  fmtDate: (t: string) => string;
}
export interface Stage {
  set(d: StageData): void;
  theme(): void;
}

// Rutas del mapa de importación (index.html): en variables para que TypeScript no intente resolverlas
const THREE_URL = "three";
const ROOM_URL = "three/addons/environments/RoomEnvironment.js";
const M = 180; // muestras de la lámina: fijas para poder transformar una forma en otra
const K = 44; // anillos del volumen de previsión
const SEG = 28; // lados de cada anillo
const W = 4.4; // ancho de la escena
const HGT = 2.8; // alto de la escena
const D = 0.16; // medio grosor de la lámina
const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Muelle críticamente amortiguado (respuesta en segundos): avanza `s` un paso de `dt`. */
function spring(s: { x: number; v: number }, target: number, dt: number, response: number) {
  if (still) {
    s.x = target;
    s.v = 0;
    return;
  }
  const w = (2 * Math.PI) / response;
  s.v += (w * w * (target - s.x) - 2 * w * s.v) * dt;
  s.x += s.v * dt;
}
const sp = (x = 0) => ({ x, v: 0 });

export function createStage(host: HTMLElement): Stage {
  const canvas = document.createElement("canvas");
  canvas.className = "stage-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const labels = document.createElement("div");
  labels.className = "stage-labels";
  host.append(canvas, labels);

  let data: StageData | null = null;
  let ready = false;
  // Se rellenan al construir la escena; hasta entonces no hacen nada
  const hooks = { data: () => {}, theme: () => {} };

  const api: Stage = {
    set(d) {
      data = d;
      if (ready) hooks.data();
      else flat(host, d);
    },
    theme() {
      hooks.theme();
    },
  };

  void (async () => {
    let THREE: any;
    let Room: any;
    try {
      THREE = await import(/* @vite-ignore */ THREE_URL);
      Room = (await import(/* @vite-ignore */ ROOM_URL)).RoomEnvironment;
    } catch {
      return; // se queda el SVG plano
    }
    host.querySelector(".stage-flat")?.remove();
    ready = true;
    build(THREE, Room);
    hooks.data();
  })();

  function build(THREE: any, Room: any) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new Room(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2, 4, 5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    const world = new THREE.Group();
    // Bucle de animación: se declara antes de que nada pueda llamar a kick()
    let raf = 0;
    let last = performance.now();
    let idleFrames = 0;
    scene.add(world);

    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const col = (name: string) => new THREE.Color(css(name) || "#888");

    // ── lámina del precio: cresta (arriba) y cortina (cara frontal) ──
    const ridgeGeo = new THREE.BufferGeometry();
    const ridgePos = new Float32Array(M * 2 * 3);
    ridgeGeo.setAttribute("position", new THREE.BufferAttribute(ridgePos, 3));
    const curtGeo = new THREE.BufferGeometry();
    const curtPos = new Float32Array(M * 2 * 3);
    const curtCol = new Float32Array(M * 2 * 4);
    curtGeo.setAttribute("position", new THREE.BufferAttribute(curtPos, 3));
    curtGeo.setAttribute("color", new THREE.BufferAttribute(curtCol, 4));
    const stripIdx: number[] = [];
    for (let i = 0; i < M - 1; i++) {
      const a = i * 2,
        b = a + 1,
        c = a + 2,
        d = a + 3;
      stripIdx.push(a, b, c, b, d, c);
    }
    ridgeGeo.setIndex(stripIdx);
    curtGeo.setIndex(stripIdx);
    const ridgeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.1,
      clearcoat: 1,
      side: THREE.DoubleSide,
    });
    const curtMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
    const curtain = new THREE.Mesh(curtGeo, curtMat);
    world.add(curtain, ridge);

    // ── volumen de la previsión ──
    const coneGeo = new THREE.BufferGeometry();
    const conePos = new Float32Array(K * SEG * 3);
    coneGeo.setAttribute("position", new THREE.BufferAttribute(conePos, 3));
    const coneIdx: number[] = [];
    for (let j = 0; j < K - 1; j++)
      for (let k = 0; k < SEG; k++) {
        const a = j * SEG + k,
          b = j * SEG + ((k + 1) % SEG),
          c = a + SEG,
          d = b + SEG;
        coneIdx.push(a, c, b, b, c, d);
      }
    coneGeo.setIndex(coneIdx);
    const coneMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      roughness: 0.18,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    world.add(cone);
    // Mediana: hilo fino dentro del volumen
    const midGeo = new THREE.BufferGeometry();
    const midPos = new Float32Array(K * 3);
    midGeo.setAttribute("position", new THREE.BufferAttribute(midPos, 3));
    const midLine = new THREE.Line(midGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
    world.add(midLine);

    // ── gota de crudo ──
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 48, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x060607,
        roughness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        iridescence: 0.7,
        iridescenceIOR: 1.32,
        iridescenceThicknessRange: [180, 560],
      }),
    );
    world.add(drop);

    // ── precio real posterior (Un día pasado) y aro en la fecha objetivo ──
    const realGeo = new THREE.BufferGeometry();
    const realMax = 260;
    const realPos = new Float32Array(realMax * 3);
    realGeo.setAttribute("position", new THREE.BufferAttribute(realPos, 3));
    const realLine = new THREE.Line(realGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
    world.add(realLine);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.014, 16, 48),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, transparent: true }),
    );
    world.add(ring);

    // ── rejilla de precios y línea de hoy ──
    const gridGeo = new THREE.BufferGeometry();
    const gridPos = new Float32Array(5 * 2 * 3 + 2 * 3);
    gridGeo.setAttribute("position", new THREE.BufferAttribute(gridPos, 3));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }));
    world.add(grid);

    // ── etiquetas HTML proyectadas desde la escena ──
    const tag = (cls: string) => {
      const el = document.createElement("div");
      el.className = `st-tag ${cls}`;
      labels.appendChild(el);
      return el;
    };
    const tToday = tag("is-today");
    const tMid = tag("is-fc");
    const tHi = tag("is-end");
    const tLo = tag("is-end");
    const tReal = tag("is-real");
    const tDateA = tag("is-date");
    const tDateB = tag("is-date is-today-date");
    const tDateC = tag("is-date is-fc-date");
    const tGrid = [0, 1, 2, 3, 4].map(() => tag("is-grid"));
    const tEvents: HTMLElement[] = [];

    // ── estado animado ──
    const ys = Array.from({ length: M }, () => sp(0));
    const fh = sp(0.8); // fracción del ancho que ocupa el pasado
    const fcLo = sp(0),
      fcMid = sp(0),
      fcHi = sp(0),
      today = sp(0);
    const grow = sp(0); // 0 = sin previsión, 1 = abierta hasta la fecha objetivo
    const reveal = sp(0);
    const realYs: number[] = [];
    const gridY = [0, 1, 2, 3, 4].map(() => sp(0));
    let gridVals: number[] = [];
    const tilt = { x: sp(0), y: sp(0) };
    let pointer = { x: 0, y: 0 };
    let landed = 0; // momento en que la gota llegó (para el pequeño aplastamiento)
    let lastGrow = 0;

    let lo = 0,
      span = 1;
    const Y = (v: number) => -HGT / 2 + (HGT * (v - lo)) / span;
    const X = (u: number) => -W / 2 + W * u; // u en [0, 1]

    const niceTicks = (a: number, b: number) => {
      const raw = (b - a) / 4;
      const p = 10 ** Math.floor(Math.log10(raw));
      const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
      const out: number[] = [];
      for (let v = Math.ceil(a / step) * step; v <= b && out.length < 5; v += step) out.push(v);
      return out;
    };

    hooks.data = () => {
      if (!data) return;
      const d = data;
      const all = d.v.concat(d.future.length && d.revealed ? d.future : []);
      if (d.fc) all.push(d.fc.lo, d.fc.hi);
      let mn = Math.min(...all),
        mx = Math.max(...all);
      const pad = (mx - mn) * 0.12 || 1;
      mn -= pad;
      mx += pad;
      lo = mn;
      span = mx - mn;
      // Resample del pasado a M puntos
      const n = d.v.length;
      for (let i = 0; i < M; i++) {
        const f = (i / (M - 1)) * (n - 1);
        const a = Math.floor(f),
          b = Math.min(n - 1, a + 1);
        (ys[i] as any).t = Y(d.v[a] + (d.v[b] - d.v[a]) * (f - a));
      }
      (fh as any).t = (n - 1) / (n - 1 + d.h);
      (today as any).t = Y(d.v[n - 1]);
      if (d.fc) {
        (fcLo as any).t = Y(d.fc.lo);
        (fcMid as any).t = Y(d.fc.mid);
        (fcHi as any).t = Y(d.fc.hi);
      }
      (grow as any).t = d.fc ? 1 : 0;
      (reveal as any).t = d.revealed && d.future.length ? 1 : 0;
      realYs.length = 0;
      for (const v of d.future) realYs.push(Y(v));
      gridVals = niceTicks(mn, mx);
      gridVals.forEach((v, i) => ((gridY[i] as any).t = Y(v)));
      // Sucesos visibles en la ventana
      tEvents.forEach((e) => e.remove());
      tEvents.length = 0;
      for (const ev of d.events) {
        const i = d.t.indexOf(ev.t);
        if (i < 0) continue;
        const el = tag("is-event");
        el.textContent = ev.label;
        (el as any).u = (i / (n - 1)) * 1;
        (el as any).y = d.v[i];
        tEvents.push(el);
      }
      tDateA.textContent = d.fmtDate(d.t[0]);
      tDateB.textContent = d.fmtDate(d.t[n - 1]);
      tDateC.textContent = d.fmtDate(d.target);
      tToday.textContent = d.fmt(d.v[n - 1]);
      if (d.fc) {
        tMid.textContent = d.fmt(d.fc.mid);
        tHi.textContent = d.fmt(d.fc.hi);
        tLo.textContent = d.fmt(d.fc.lo);
      }
      if (d.future.length) tReal.textContent = d.fmt(d.future[d.future.length - 1]);
      kick();
    };

    hooks.theme = () => {
      ridgeMat.color = col("--st-ridge");
      coneMat.color = col("--accent");
      (midLine.material as any).color = col("--accent");
      (realLine.material as any).color = col("--st-real");
      ring.material.color = col("--st-real");
      (grid.material as any).color = col("--st-grid");
      const c = col("--st-curtain");
      for (let i = 0; i < M; i++) {
        curtCol.set([c.r, c.g, c.b, 0.34], i * 8);
        curtCol.set([c.r, c.g, c.b, 0.0], i * 8 + 4);
      }
      curtGeo.attributes.color.needsUpdate = true;
      kick();
    };
    hooks.theme();

    host.addEventListener("pointermove", (e) => {
      const r = host.getBoundingClientRect();
      pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
      kick();
    });
    host.addEventListener("pointerleave", () => {
      pointer = { x: 0, y: 0 };
      kick();
    });

    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Encuadre: toda la escena cabe a lo ancho y a lo alto
      // (con margen a la derecha para las etiquetas de la previsión y abajo para las fechas)
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      const fit = Math.max((W + 1.5) / (2 * tan * camera.aspect), (HGT + 0.9) / (2 * tan));
      camera.position.set(0.45, 0.75, fit);
      camera.lookAt(0, -0.05, 0);
      camera.updateProjectionMatrix();
      kick();
    };
    new ResizeObserver(resize).observe(host);

    const v3 = new THREE.Vector3();
    const place = (el: HTMLElement, x: number, y: number, z: number, show: boolean) => {
      v3.set(x, y, z);
      world.localToWorld(v3);
      v3.project(camera);
      const px = (v3.x * 0.5 + 0.5) * host.clientWidth;
      const py = (-v3.y * 0.5 + 0.5) * host.clientHeight;
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      el.classList.toggle("is-on", show);
    };

    function kick() {
      idleFrames = 0;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      let moving = 0;
      const step = (s: { x: number; v: number }, r: number) => {
        const tg = (s as any).t ?? s.x;
        spring(s, tg, dt, r);
        moving += Math.abs(tg - s.x) + Math.abs(s.v);
      };
      ys.forEach((s) => step(s, 0.55));
      [fh, today, fcLo, fcMid, fcHi].forEach((s) => step(s, 0.55));
      step(grow, 1.1);
      step(reveal, 1.2);
      gridY.forEach((s) => step(s, 0.55));
      tilt.x.v = tilt.x.v || 0;
      (tilt.x as any).t = pointer.x * 0.16;
      (tilt.y as any).t = pointer.y * 0.07;
      step(tilt.x, 0.8);
      step(tilt.y, 0.8);

      world.position.x = -0.42;
      world.rotation.y = -0.12 + tilt.x.x + (still ? 0 : Math.sin(t * 0.25) * 0.02);
      world.rotation.x = 0.04 + tilt.y.x;

      // Lámina del pasado
      const ux = fh.x;
      for (let i = 0; i < M; i++) {
        const x = X((i / (M - 1)) * ux);
        const y = ys[i].x;
        ridgePos.set([x, y, D, x, y, -D], i * 6);
        curtPos.set([x, y, D, x, -HGT / 2 - 0.05, D], i * 6);
      }
      ridgeGeo.attributes.position.needsUpdate = true;
      ridgeGeo.computeVertexNormals();
      curtGeo.attributes.position.needsUpdate = true;

      // Volumen de previsión: de hoy a la fecha objetivo, crece con `grow`
      const x0 = X(ux),
        x1 = X(1),
        y0 = today.x;
      const g = Math.max(0.0001, grow.x);
      for (let j = 0; j < K; j++) {
        const s = (j / (K - 1)) * g;
        const c = y0 + s * (fcMid.x - y0);
        const up = c + Math.sqrt(s) * Math.max(0.004, fcHi.x - fcMid.x);
        const dn = c - Math.sqrt(s) * Math.max(0.004, fcMid.x - fcLo.x);
        const cy = (up + dn) / 2,
          ry = (up - dn) / 2,
          rz = Math.sqrt(s) * 0.42 + 0.004;
        const x = x0 + s * (x1 - x0);
        for (let k = 0; k < SEG; k++) {
          const a = (k / SEG) * Math.PI * 2;
          conePos.set([x, cy + Math.sin(a) * ry, Math.cos(a) * rz], (j * SEG + k) * 3);
        }
        midPos.set([x, c, 0], j * 3);
      }
      coneGeo.attributes.position.needsUpdate = true;
      coneGeo.computeVertexNormals();
      midGeo.attributes.position.needsUpdate = true;
      cone.visible = midLine.visible = grow.x > 0.01;
      coneMat.opacity = 0.3 * Math.min(1, grow.x * 1.5);

      // Gota: en hoy hasta prever; luego recorre la mediana y se posa en la fecha objetivo
      const sDrop = grow.x;
      const dx = x0 + sDrop * (x1 - x0);
      const dy = y0 + sDrop * (fcMid.x - y0);
      if (lastGrow < 0.995 && grow.x >= 0.995) landed = t;
      lastGrow = grow.x;
      const since = t - landed;
      const squash = landed && since < 0.5 && !still ? Math.sin(since * Math.PI * 4) * Math.exp(-since * 7) * 0.22 : 0;
      const bob = still ? 0 : Math.sin(t * 1.6) * 0.012;
      drop.position.set(dx, dy + 0.1 + bob, 0);
      drop.scale.set(1 + squash, 1 - squash, 1 + squash);

      // Precio real posterior, dibujado según `reveal`
      const nReal = realYs.length;
      for (let i = 0; i < Math.min(nReal, realMax); i++) {
        const x = x0 + ((i + 1) / nReal) * (x1 - x0);
        realPos.set([x, realYs[i], 0.02], i * 3);
      }
      realGeo.attributes.position.needsUpdate = true;
      const shown = Math.round(Math.min(nReal, realMax) * reveal.x);
      realGeo.setDrawRange(0, shown);
      realLine.visible = shown > 1;
      ring.visible = reveal.x > 0.98 && nReal > 0;
      if (nReal) ring.position.set(x1, realYs[nReal - 1], 0.02);
      ring.rotation.y = t * 0.6;

      // Rejilla y línea de hoy
      for (let i = 0; i < 5; i++) {
        const y = i < gridVals.length ? gridY[i].x : -99;
        gridPos.set([X(0) - 0.05, y, -D, X(1), y, -D], i * 6);
      }
      gridPos.set([x0, -HGT / 2 - 0.05, -D, x0, HGT / 2 + 0.1, -D], 30);
      gridGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);

      // Etiquetas
      const d = data as StageData;
      const fcOn = grow.x > 0.9 && !!d?.fc;
      place(tToday, x0, y0, D, true);
      place(tMid, x1, fcMid.x, 0, fcOn);
      place(tHi, x1, Math.max(fcHi.x, fcMid.x) + 0, 0, fcOn);
      place(tLo, x1, Math.min(fcLo.x, fcMid.x), 0, fcOn);
      place(tReal, x1, nReal ? realYs[nReal - 1] : 0, 0.02, reveal.x > 0.98 && nReal > 0);
      place(tDateA, X(0), -HGT / 2 - 0.05, D, true);
      place(tDateB, x0, -HGT / 2 - 0.05, D, true);
      place(tDateC, x1, -HGT / 2 - 0.05, D, true);
      gridVals.forEach((v, i) => {
        tGrid[i].textContent = d?.fmt(v) ?? "";
        place(tGrid[i], X(0) - 0.08, gridY[i].x, -D, true);
      });
      for (let i = gridVals.length; i < 5; i++) tGrid[i].classList.remove("is-on");
      for (const el of tEvents) {
        const u = (el as any).u * ux;
        const i = Math.round((el as any).u * (M - 1));
        place(el, X(u), ys[Math.min(M - 1, i)].x + 0.12, D, true);
      }

      // Sigue animando mientras haya movimiento; en reposo, solo el balanceo suave de la gota
      idleFrames = moving < 0.0005 ? idleFrames + 1 : 0;
      if (!still || idleFrames < 2) raf = requestAnimationFrame(frame);
    }
    kick();
  }

  return api;
}

/** Gráfico plano de reserva (sin WebGL o sin conexión a jsDelivr). */
function flat(host: HTMLElement, d: StageData) {
  let svg = host.querySelector<SVGSVGElement>(".stage-flat");
  if (!svg) {
    host.insertAdjacentHTML("beforeend", '<svg class="stage-flat" viewBox="0 0 100 60" preserveAspectRatio="none"></svg>');
    svg = host.querySelector(".stage-flat") as SVGSVGElement;
  }
  const n = d.v.length,
    T = n - 1 + d.h;
  const all = d.v.concat(d.fc ? [d.fc.lo, d.fc.hi] : []);
  const mn = Math.min(...all),
    mx = Math.max(...all);
  const y = (v: number) => 55 - ((v - mn) / (mx - mn || 1)) * 50;
  const pts = d.v.map((v, i) => `${((i / T) * 96).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const x0 = ((n - 1) / T) * 96;
  const cone = d.fc
    ? `<polygon class="flat-fc" points="${x0},${y(d.v[n - 1])} 96,${y(d.fc.hi)} 96,${y(d.fc.lo)}"/>`
    : "";
  svg.innerHTML = `${cone}<polyline class="flat-line" points="${pts}"/>`;
}
