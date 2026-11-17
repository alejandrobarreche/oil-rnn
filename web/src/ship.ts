// Petrolero 3D de la mesa de compras: un solo barco con geometría propia que cambia de eslora según la
// carga elegida y, al llenarse, se hunde hasta su línea de flotación (la obra viva, en violeta, queda
// bajo el agua). Three.js se carga al pedir el barco por primera vez (mapa de importación en
// index.html); solo se pinta mientras algo se mueve y, con movimiento reducido, cada cambio es una
// imagen fija. Si Three.js no carga, el hueco se oculta y la página sigue funcionando.
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
const ROOM_URL = "three/addons/environments/RoomEnvironment.js";
const MAX_L = 330;
// Medidas del barco más grande en unidades de escena (1 = 10 m)
const L = 33;
const B = 5.8;
const D = 3;
const T_FULL = 2; // calado cargado: la línea de flotación
const T_EMPTY = 0.75; // calado en lastre
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Muelle críticamente amortiguado que parte del valor en pantalla. */
function spring(s: { x: number; v: number }, target: number, dt: number, response: number) {
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
  const mats: Record<string, any> = {};
  let raf = 0;
  let last = 0;

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const dark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  function paint() {
    if (!THREE) return;
    mats.hull.color.set(css("--ink"));
    mats.bottom.color.set(css("--accent"));
    mats.deck.color.set(dark() ? "#4a4852" : "#8c8a96");
    mats.house.color.set(dark() ? "#e9e6f5" : "#ffffff");
    mats.glass.color.set(dark() ? "#0a0a0c" : "#1a1a1f");
    mats.stripe.color.set(css("--accent"));
    mats.water.color.set(css("--accent"));
    mats.water.opacity = dark() ? 0.42 : 0.3;
    scene.fog.color.set(css("--bg"));
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    spring(scale, toScale, dt, 0.55);
    spring(sink, toSink, dt, 1.1);
    group.scale.setScalar(scale.x);
    group.position.y = -sink.x * scale.x;
    // Cabeceo leve mientras se hunde: la proa entra un poco antes que la popa
    group.rotation.z = -sink.v * 0.035;
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
    const k = Math.max(1, 2.9 / camera.aspect);
    camera.position.set(15 * k, 8 * k, 24 * k);
    camera.lookAt(0, 1.2, 0);
    camera.updateProjectionMatrix();
    kick();
    if (!raf) renderer.render(scene, camera);
  }

  function build() {
    const box = (w: number, h: number, d: number, m: any, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const std = (o: object) => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, ...o });
    mats.hull = std({ roughness: 0.4 });
    mats.bottom = std({ roughness: 0.6 });
    mats.deck = std({ roughness: 0.8 });
    mats.house = std({ roughness: 0.5 });
    mats.glass = std({ roughness: 0.15, metalness: 0.3 });
    mats.stripe = std({});
    mats.water = new THREE.MeshStandardMaterial({
      transparent: true,
      roughness: 0.25,
      metalness: 0,
      depthWrite: false,
    });

    // Planta del casco: popa recta con esquinas redondeadas, cuerpo paralelo y proa llena
    const x0 = -L / 2;
    const x1 = L / 2;
    const xb = x1 - 5.5;
    const b = B / 2;
    const s = new THREE.Shape();
    s.moveTo(x0 + 0.7, -b);
    s.lineTo(xb, -b);
    s.bezierCurveTo(xb + 3.4, -b, x1, -b * 0.55, x1, 0);
    s.bezierCurveTo(x1, b * 0.55, xb + 3.4, b, xb, b);
    s.lineTo(x0 + 0.7, b);
    s.quadraticCurveTo(x0, b, x0, b - 0.7);
    s.lineTo(x0, -b + 0.7);
    s.quadraticCurveTo(x0, -b, x0 + 0.7, -b);
    const slab = (depth: number, y: number) => {
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 28 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      return g;
    };
    // Obra viva (bajo la línea de flotación) y obra muerta; la tapa superior es la cubierta
    group.add(new THREE.Mesh(slab(T_FULL, 0), mats.bottom));
    group.add(new THREE.Mesh(slab(D - T_FULL, T_FULL), [mats.deck, mats.hull]));

    // Tuberías de carga a lo largo de la cubierta y colector en el centro
    for (const z of [-0.55, 0.55]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 22, 10), mats.house);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(1, D + 0.2, z);
      group.add(pipe);
    }
    box(0.5, 0.35, B * 0.8, mats.house, 1.2, D + 0.18);
    box(22, 0.06, 0.5, mats.deck, 1, D + 0.45);
    // Escotillas de los tanques
    for (let i = 0; i < 6; i++) box(0.6, 0.18, 0.6, mats.house, -8.5 + i * 3.6, D + 0.09, 1.6);

    // Castillo de popa: cinco cubiertas, alerones del puente, ventanas y chimenea
    const hx = x0 + 2.3;
    box(3.6, 2.4, 4.6, mats.house, hx, D + 1.2);
    box(3.0, 0.7, 4.0, mats.house, hx - 0.2, D + 2.75);
    box(0.9, 0.12, B + 0.2, mats.house, hx + 1.3, D + 2.45);
    for (let i = 0; i < 4; i++) box(0.05, 0.16, 4.2, mats.glass, hx + 1.81, D + 0.45 + i * 0.52);
    box(0.05, 0.22, 3.6, mats.glass, hx + 1.31, D + 2.85);
    box(1.1, 1.5, 1.4, mats.house, hx - 1.1, D + 3.6);
    box(1.14, 0.3, 1.44, mats.stripe, hx - 1.1, D + 3.95);
    box(1.16, 0.18, 1.46, mats.glass, hx - 1.1, D + 4.36);
    // Castillo de proa y mástil
    box(2.4, 0.5, 3.4, mats.hull, x1 - 3.6, D + 0.25);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), mats.house);
    mast.position.set(x1 - 3.4, D + 1.6, 0);
    group.add(mast);

    // Mar: lámina violeta translúcida en y = 0; lo que queda debajo se ve teñido
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mats.water);
    sea.rotation.x = -Math.PI / 2;
    sea.renderOrder = 2;
    scene.add(sea);
  }

  async function init() {
    try {
      THREE = await import(/* @vite-ignore */ THREE_URL);
      const Room = (await import(/* @vite-ignore */ ROOM_URL)).RoomEnvironment;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      el.appendChild(renderer.domElement);
      scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new Room(), 0.04).texture;
      scene.fog = new THREE.Fog(0xffffff, 30, 70);
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(12, 22, 14);
      scene.add(sun);
      camera = new THREE.PerspectiveCamera(26, 3, 0.1, 400);
      group = new THREE.Group();
      scene.add(group);
      build();
      paint();
      group.scale.setScalar(scale.x);
      group.position.y = -sink.x * scale.x;
      new ResizeObserver(fit).observe(el);
      fit();
      el.classList.add("is-ready");
    } catch {
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
