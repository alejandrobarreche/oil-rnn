// Petrolero 3D de la mesa de compras: un solo barco con geometría propia que cambia de eslora según la
// carga elegida y, al llenarse, se hunde hasta su línea de flotación (la obra viva, roja, queda bajo el
// agua). El casco se genera por secciones: fondo plano, pantoque redondeado, proa lanzada con bulbo y
// popa de espejo. El mar es una lámina gris con oleaje procedural que refleja un cielo en degradado.
// Three.js se carga al pedir el barco por primera vez (mapa de importación en index.html); solo se pinta
// mientras algo se mueve y, con movimiento reducido, cada cambio es una imagen fija. Si Three.js no
// carga, el hueco se oculta y la página sigue funcionando.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Ship {
  /** Nodo que se coloca en la página; se puede mover de un sitio a otro sin perder la escena. */
  el: HTMLElement;
  /** Eslora en metros (245, 275 o 330). */
  size(length: number): void;
  load(full: boolean): void;
  theme(): void;
}

const THREE_URL = "three";
const MAX_L = 330;
// Medidas del barco más grande en unidades de escena (1 = 10 m): eslora, manga, puntal y calado
const L = 33;
const B = 5.8;
const D = 3;
const T_FULL = 2; // calado cargado: la línea de flotación
const T_EMPTY = 0.8; // calado en lastre
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const sstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ── forma del casco ─────────────────────────────────────────
/** Extremo de popa a la altura h: espejo vertical arriba, la carena se recoge hacia proa abajo. */
const xStern = (h: number) => -L / 2 + 2.6 * (1 - sstep(0.15, T_FULL + 0.2, h)) ** 1.3;
/** Extremo de proa a la altura h: roda lanzada, más corta en la quilla que en cubierta. */
const xBow = (h: number) => L / 2 - 1.5 * (1 - clamp01(h / D)) ** 1.6;
/** Semimanga en (x, h). */
function halfBeam(x: number, h: number): number {
  let b = B / 2;
  const xp = L / 2 - 6.5;
  if (x > xp) {
    const t = clamp01((x - xp) / (xBow(h) - xp));
    b *= (1 - t ** 2.2) ** (0.42 + 0.25 * (1 - h / D));
  }
  const xq = -L / 2 + 5.5;
  if (x < xq) {
    const s = clamp01((x - xStern(h)) / (xq - xStern(h)));
    const k = sstep(0.3, T_FULL + 0.4, h);
    b *= (1 - k) * s ** 0.55 + k * (0.86 + 0.14 * Math.sin((s * Math.PI) / 2));
  }
  const r = 0.75; // radio del pantoque
  if (h < r) b -= r - Math.sqrt(r * r - (r - h) ** 2);
  return Math.max(0, b);
}
/** Altura de la cubierta: arrufo hacia proa. */
const deckAt = (u: number) => D + 0.4 * sstep(0.8, 1, u);

const still0 = { x: 0, v: 0 };
/** Muelle críticamente amortiguado que parte del valor en pantalla. */
function spring(s: typeof still0, target: number, dt: number, response: number) {
  if (still()) {
    s.x = target;
    s.v = 0;
    return;
  }
  const w = (2 * Math.PI) / response;
  s.v += (w * w * (target - s.x) - 2 * w * s.v) * dt;
  s.x += s.v * dt;
}

export function createShip(): Ship {
  const el = document.createElement("div");
  el.className = "ship3d";
  el.setAttribute("aria-hidden", "true");

  const scale = { x: 275 / MAX_L, v: 0 };
  const sink = { x: T_EMPTY, v: 0 };
  let toScale = scale.x;
  let toSink = sink.x;
  let THREE: any = null;
  let renderer: any;
  let scene: any;
  let camera: any;
  let group: any;
  let pmrem: any;
  let envRT: any = null;
  let foam: any;
  let water: any;
  let raf = 0;
  let last = 0;

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const dark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  // ── cielo: degradado que ilumina y se refleja en el agua y el casco ──
  function sky() {
    const env = new THREE.Scene();
    const d = dark();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(d ? "#3a3c46" : "#c9ced6") },
        mid: { value: new THREE.Color(d ? "#7a7c88" : "#eef0f3") },
        low: { value: new THREE.Color(d ? "#24252b" : "#6f757b") },
        sun: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() },
        sunI: { value: d ? 3 : 5 },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun; uniform float sunI; varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.6)) : mix(mid, low, pow(-y, 0.4));
          float s = max(dot(normalize(vDir), sun), 0.0);
          c += vec3(1.0, 0.97, 0.92) * (pow(s, 600.0) * sunI * 4.0 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), mat));
    envRT?.dispose();
    envRT = pmrem.fromScene(env, 0);
    scene.environment = envRT.texture;
    mat.dispose();
  }

  // ── oleaje: mapa de normales generado (suma de ondas que repiten en el borde) ──
  function waveNormals() {
    const N = 256;
    const data = new Uint8Array(N * N * 4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const waves = Array.from({ length: 36 }, () => {
      const kx = Math.round((rnd() * 2 - 1) * 14) || 1;
      const ky = Math.round((rnd() * 2 - 1) * 9) || 1;
      const k = Math.hypot(kx, ky);
      return { kx, ky, a: 1 / k ** 1.4, p: rnd() * Math.PI * 2 };
    });
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let dx = 0;
        let dy = 0;
        for (const w of waves) {
          const c = Math.cos(2 * Math.PI * ((w.kx * i) / N + (w.ky * j) / N) + w.p) * w.a * 2 * Math.PI;
          dx += c * w.kx;
          dy += c * w.ky;
        }
        const s = 0.012;
        const nx = -dx * s;
        const ny = -dy * s;
        const l = Math.hypot(nx, ny, 1);
        const o = (j * N + i) * 4;
        data[o] = ((nx / l) * 0.5 + 0.5) * 255;
        data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255;
        data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        data[o + 3] = 255;
      }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(52, 52);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    return tex;
  }

  // ── ventanas del castillo: textura dibujada en un canvas ──
  function windowsTex(cols: number, bridge: boolean) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 64;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#efefec";
    g.fillRect(0, 0, 512, 64);
    if (bridge) {
      g.fillStyle = "#1e2226";
      g.fillRect(0, 14, 512, 36);
      g.fillStyle = "#efefec";
      for (let i = 1; i < cols; i++) g.fillRect((i * 512) / cols - 1, 14, 3, 36);
    } else {
      g.fillStyle = "#23272b";
      const w = 512 / cols;
      for (let i = 0; i < cols; i++) g.fillRect(i * w + w * 0.18, 20, w * 0.64, 26);
    }
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, 60, 512, 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // ── casco por secciones ──
  function hullGeometry(h0: number, h1: (u: number) => number, nz: number, caps: { bottom?: boolean; deck?: boolean }) {
    const NU = 150;
    const pos: number[] = [];
    const idx: number[] = [];
    const groups: { start: number; count: number; mat: number }[] = [];
    const grid = (side: 1 | -1) => {
      const base = pos.length / 3;
      for (let j = 0; j <= nz; j++)
        for (let i = 0; i <= NU; i++) {
          const u = i / NU;
          const top = h1(u);
          const t = j / nz;
          const h = h0 + (top - h0) * (h0 === 0 ? t ** 1.5 : t);
          const x = xStern(h) + u * (xBow(h) - xStern(h));
          pos.push(x, h, side * halfBeam(x, h));
        }
      const at = (i: number, j: number) => base + j * (NU + 1) + i;
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < NU; i++) {
          const a = at(i, j);
          const b = at(i + 1, j);
          const c = at(i, j + 1);
          const d = at(i + 1, j + 1);
          if (side === 1) idx.push(a, b, d, a, d, c);
          else idx.push(a, d, b, a, c, d);
        }
      return at;
    };
    const start = idx.length;
    const P = grid(1);
    const S = grid(-1);
    // Espejo de popa (u = 0): une los dos costados
    for (let j = 0; j < nz; j++) idx.push(P(0, j), S(0, j), S(0, j + 1), P(0, j), S(0, j + 1), P(0, j + 1));
    if (caps.bottom) for (let i = 0; i < NU; i++) idx.push(P(i, 0), S(i + 1, 0), P(i + 1, 0), P(i, 0), S(i, 0), S(i + 1, 0));
    groups.push({ start, count: idx.length - start, mat: 0 });
    if (caps.deck) {
      // Cubierta con vértices propios para que su normal mire arriba sin mezclarse con el costado
      const ds = idx.length;
      const base = pos.length / 3;
      for (let i = 0; i <= NU; i++) {
        const k = nz * (NU + 1) + i;
        pos.push(pos[(P(0, 0) + k) * 3], pos[(P(0, 0) + k) * 3 + 1], pos[(P(0, 0) + k) * 3 + 2]);
        pos.push(pos[(S(0, 0) + k) * 3], pos[(S(0, 0) + k) * 3 + 1], pos[(S(0, 0) + k) * 3 + 2]);
      }
      for (let i = 0; i < NU; i++) {
        const a = base + i * 2;
        idx.push(a, a + 3, a + 2, a, a + 1, a + 3);
      }
      groups.push({ start: ds, count: idx.length - ds, mat: 1 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
    g.computeVertexNormals();
    return g;
  }

  // ── espuma en la línea de flotación: cinta que sigue el casco a la altura del calado ──
  const FN = 120;
  function foamGeometry() {
    const n = FN * 2 + 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const col = new Float32Array(n * 2 * 4);
    for (let k = 0; k < n; k++) {
      col.set([1, 1, 1, 0.55], k * 8);
      col.set([1, 1, 1, 0], k * 8 + 4);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
    const idx: number[] = [];
    for (let k = 0; k < n - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    g.setIndex(idx);
    return g;
  }
  function updateFoam(h: number) {
    const ring: [number, number][] = [];
    const xs = xStern(h);
    const xe = xBow(h);
    for (let i = 0; i <= FN; i++) {
      const x = xs + (i / FN) * (xe - xs);
      ring.push([x, halfBeam(x, h)]);
    }
    for (let i = FN; i >= 0; i--) ring.push([ring[i][0], -ring[i][1]]);
    const p = foam.geometry.attributes.position;
    const w = 0.45;
    ring.forEach(([x, z], k) => {
      const [px, pz] = ring[Math.max(0, k - 1)];
      const [nx, nz] = ring[Math.min(ring.length - 1, k + 1)];
      let ox = nz - pz;
      let oz = -(nx - px);
      const l = Math.hypot(ox, oz) || 1;
      ox /= l;
      oz /= l;
      p.setXYZ(k * 2, x, h + 0.01, z);
      p.setXYZ(k * 2 + 1, x + ox * w, h + 0.01, z + oz * w);
    });
    p.needsUpdate = true;
  }

  function paint() {
    if (!THREE) return;
    sky();
    water.color.set(dark() ? "#2a2e33" : "#3b4246");
    scene.fog.color.set(css("--bg"));
    scene.environmentIntensity = dark() ? 1.1 : 1;
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    spring(scale, toScale, dt, 0.55);
    spring(sink, toSink, dt, 1.2);
    group.scale.setScalar(scale.x);
    group.position.y = -sink.x * scale.x;
    // Cabeceo leve mientras se hunde y el agua se mueve un poco con el barco
    group.rotation.z = -sink.v * 0.03;
    updateFoam(sink.x);
    water.normalMap.offset.x += dt * 0.004;
    renderer.render(scene, camera);
    const moving =
      Math.abs(scale.x - toScale) > 1e-4 ||
      Math.abs(scale.v) > 1e-4 ||
      Math.abs(sink.x - toSink) > 1e-4 ||
      Math.abs(sink.v) > 1e-4;
    raf = moving ? requestAnimationFrame(frame) : 0;
  }
  const kick = () => {
    if (!THREE || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  function fit() {
    if (!THREE) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Más lejos cuanto más estrecho, para que el barco más grande quepa entero
    const k = Math.max(1, 3.1 / camera.aspect);
    camera.position.set(17 * k, 5.4 * k, 26 * k);
    camera.lookAt(0, 1.4, 0);
    camera.updateProjectionMatrix();
    if (!raf) {
      updateFoam(sink.x);
      renderer.render(scene, camera);
    }
  }

  function build() {
    const std = (color: string, o: object = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide, ...o });
    const m = {
      top: std("#25272b", { roughness: 0.45, metalness: 0.25 }),
      red: std("#6e2c27", { roughness: 0.7 }),
      deck: std("#6d6a64", { roughness: 0.85 }),
      white: std("#eeeeea", { roughness: 0.5 }),
      steel: std("#b9bcbe", { roughness: 0.4, metalness: 0.5 }),
      dark: std("#1b1d20", { roughness: 0.5 }),
      band: std(css("--accent") || "#6a4cf0", { roughness: 0.5 }),
    };
    const add = (geo: any, mat: any, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, mat: any, x: number, y: number, z = 0) =>
      add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
    const cyl = (r: number, len: number, mat: any, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y") => {
      const mesh = add(new THREE.CylinderGeometry(r, r, len, 12), mat, x, y, z);
      if (axis === "x") mesh.rotation.z = Math.PI / 2;
      if (axis === "z") mesh.rotation.x = Math.PI / 2;
      return mesh;
    };

    // Casco: obra viva roja hasta la flotación de carga, obra muerta oscura y cubierta de acero
    add(hullGeometry(0, () => T_FULL, 16, { bottom: true }), m.red);
    add(hullGeometry(T_FULL, deckAt, 6, { deck: true }), [m.top, m.deck]);
    // Bulbo de proa
    const bulb = add(new THREE.SphereGeometry(1, 24, 16), m.red, xBow(0) - 0.1, 0.85, 0);
    bulb.scale.set(1.5, 0.7, 0.75);

    // Equipo de cubierta: haz de tuberías sobre soportes, pasarela, colector con grúas y domos
    const x0 = -L / 2 + 5.6;
    const x1 = L / 2 - 4.8;
    for (const z of [-0.75, -0.45, -0.15, 0.15]) cyl(0.07, x1 - x0, m.steel, (x0 + x1) / 2, D + 0.28, z, "x");
    for (let x = x0 + 0.4; x < x1; x += 1.4) box(0.08, 0.26, 1.2, m.steel, x, D + 0.13, -0.3);
    box(x1 - x0, 0.05, 0.45, m.steel, (x0 + x1) / 2, D + 0.62, 0.75);
    for (let x = x0 + 0.7; x < x1; x += 2.1) box(0.05, 0.6, 0.05, m.steel, x, D + 0.3, 0.75);
    for (const z of [-2, 2]) {
      cyl(0.09, 1.6, m.steel, -0.4, D + 0.8, z * 0.75);
      const boom = cyl(0.05, 2.4, m.steel, 0.4, D + 1.4, z * 0.75);
      boom.rotation.z = -1.0;
    }
    for (let i = -1; i <= 1; i++) cyl(0.05, B * 0.8, m.steel, -0.1 + i * 0.25, D + 0.35, 0, "z");
    for (let x = x0 + 1; x < x1 - 1; x += 3) {
      cyl(0.18, 0.18, m.steel, x, D + 0.09, 1.9);
      cyl(0.18, 0.18, m.steel, x, D + 0.09, -1.9);
    }
    // Castillo de proa: molinetes y mástil
    for (const z of [-1, 1]) cyl(0.22, 0.5, m.dark, L / 2 - 3.2, deckAt(0.93) + 0.2, z * 0.8, "z");
    cyl(0.05, 2, m.steel, L / 2 - 2.5, deckAt(0.95) + 1, 0);

    // Castillo de popa: cinco cubiertas con ventanas, puente con alerones, chimenea y mástil de radar
    const xa = -L / 2 + 0.7;
    const plain = m.white;
    const win = new THREE.MeshStandardMaterial({ map: windowsTex(8, false), roughness: 0.45 });
    const brg = new THREE.MeshStandardMaterial({ map: windowsTex(10, true), roughness: 0.25, metalness: 0.2 });
    const tierH = 0.46;
    for (let k = 0; k < 6; k++) {
      const lx = 3.7 - k * 0.12;
      const mat = k === 5 ? brg : win;
      box(lx, tierH, 4.7, [mat, mat, plain, plain, mat, mat], xa + lx / 2, D + tierH * (k + 0.5));
    }
    const yb = D + tierH * 5.5;
    box(1.0, tierH * 0.8, B + 0.3, [brg, plain, plain, plain, plain, plain], xa + 3.0, yb);
    box(3.9, 0.08, 5.0, plain, xa + 1.8, D + tierH * 6 + 0.04);
    // Chimenea inclinada en tres franjas: blanca, color de la naviera (el violeta del producto) y negra
    const funnel = (y0: number, hgt: number, mat: any, w0: number) => {
      const s = new THREE.Shape();
      const rake = 0.35;
      s.moveTo(0, 0);
      s.lineTo(w0, 0);
      s.lineTo(w0 - (rake * hgt) / 1.6, hgt);
      s.lineTo(-(rake * hgt) / 1.6, hgt);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false });
      g.translate(-w0 / 2, 0, -0.6);
      return add(g, mat, xa + 0.9, y0, 0);
    };
    const yf = D + tierH * 6;
    funnel(yf, 0.9, plain, 1.3);
    funnel(yf + 0.9, 0.4, m.band, 1.3 - 0.2).position.x -= 0.2;
    funnel(yf + 1.3, 0.3, m.dark, 1.3 - 0.29).position.x -= 0.29;
    cyl(0.04, 1.4, m.steel, xa + 2.6, yf + 0.7, 0);
    box(0.06, 0.06, 1.6, m.steel, xa + 2.6, yf + 1.1, 0);
    box(0.5, 0.04, 0.08, m.dark, xa + 2.6, yf + 1.25, 0);
    // Bote salvavidas de caída libre, en la popa
    const boat = add(new THREE.CapsuleGeometry(0.24, 0.9, 6, 12), plain, xa - 0.15, D + 0.9, 0);
    boat.rotation.z = Math.PI / 2 - 0.5;

    // Mar
    water = new THREE.MeshPhysicalMaterial({
      color: "#3b4246",
      roughness: 0.12,
      metalness: 0,
      ior: 1.33,
      normalMap: waveNormals(),
      normalScale: new THREE.Vector2(0.32, 0.32),
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), water);
    sea.rotation.x = -Math.PI / 2;
    scene.add(sea);
    foam = new THREE.Mesh(
      foamGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    );
    foam.renderOrder = 2;
    group.add(foam);
  }

  async function init() {
    try {
      THREE = await import(/* @vite-ignore */ THREE_URL);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      pmrem = new THREE.PMREMGenerator(renderer);
      scene.fog = new THREE.Fog(0xffffff, 32, 85);
      const sun = new THREE.DirectionalLight(0xfff6ea, 2.4);
      sun.position.set(14, 18, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 12, bottom: -12, near: 1, far: 70 });
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.02;
      scene.add(sun);
      camera = new THREE.PerspectiveCamera(22, 3, 0.5, 400);
      group = new THREE.Group();
      scene.add(group);
      build();
      paint();
      group.scale.setScalar(scale.x);
      group.position.y = -sink.x * scale.x;
      new ResizeObserver(fit).observe(el);
      fit();
      el.classList.add("is-ready");
    } catch (err) {
      console.error(err);
      THREE = null;
      el.hidden = true;
    }
  }
  void init();

  return {
    el,
    size(length) {
      toScale = length / MAX_L;
      kick();
    },
    load(full) {
      toSink = full ? T_FULL : T_EMPTY;
      kick();
    },
    theme() {
      if (!THREE) return;
      paint();
      if (!raf) renderer.render(scene, camera);
    },
  };
}
