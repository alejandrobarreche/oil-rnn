// La gota de Brent: el mismo crudo de la página del Brent (negro, barniz e iridiscencia, con el
// bamboleo de su superficie). Aquí su agitación dice la incertidumbre: cuanto más ancha es la franja
// del plazo elegido frente al precio probable, más se agita. Three.js se carga de jsDelivr con la
// misma versión que el estudio y solo cuando la gota se va a ver.
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

export interface Drop {
  /** Anchura relativa de la franja, (p90 − p10) / p50; 0 = calma. */
  agitate(rel: number): void;
}

// El módulo llega de una URL, sin tipos
type Any = any;

export async function mountDrop(host: HTMLElement): Promise<Drop> {
  const THREE: Any = await import(/* @vite-ignore */ THREE_URL);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();

  // Entorno: una sala clara con paneles de luz, para que el barniz tenga qué reflejar
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x8c8c94, side: THREE.BackSide })));
  const panel = (x: number, y: number, z: number, sx: number, sy: number, k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k) }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(0, 9, 0, 10, 6, 6);
  panel(-9, 2, 4, 5, 8, 3.5);
  panel(9, 1, 3, 4, 7, 2.5);
  panel(0, 2, -9, 12, 4, 1.6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 14);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6a4cf0, 1.6);
  rim.position.set(-6, 2, -4);
  scene.add(rim);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x060607,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    iridescence: 0.6,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [180, 560],
  });
  const geo = new THREE.IcosahedronGeometry(1, 32);
  const base0 = geo.attributes.position.array.slice();
  const drop = new THREE.Mesh(geo, mat);
  scene.add(drop);

  let amp = 0.6; // agitación actual
  let target = 0.6;
  let t = 0;
  const wobble = () => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const X = base0[i];
      const Y = base0[i + 1];
      const Z = base0[i + 2];
      const d =
        1 +
        amp * (0.055 * Math.sin(2.1 * X + t * 0.9) * Math.cos(1.7 * Y + t * 0.7) + 0.035 * Math.sin(3.3 * Z - t * 1.1 + Y * 1.4)) +
        0.07 * Math.max(0, -Y) ** 2;
      p[i] = X * d;
      p[i + 1] = Y * d;
      p[i + 2] = Z * d;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };

  const fit = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const visH = 2 * 14 * Math.tan((16 * Math.PI) / 180);
    drop.scale.setScalar(0.36 * visH * Math.min(1, camera.aspect));
    if (reduced) frame();
  };
  const frame = () => {
    wobble();
    drop.rotation.y = t * 0.12;
    renderer.render(scene, camera);
  };

  let visible = true;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden) {
      amp += (target - amp) * Math.min(1, dt * 2.5); // muelle sin rebote hacia la nueva agitación
      t += dt * (0.7 + amp * 0.5);
      frame();
    }
    requestAnimationFrame(loop);
  };
  new ResizeObserver(fit).observe(host);
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host);
  fit();
  if (reduced) frame();
  else requestAnimationFrame(loop);
  host.classList.add("ready");

  return {
    agitate(rel: number) {
      target = 0.6 + 2.2 * Math.min(1, Math.max(0, rel));
      if (reduced) {
        amp = target;
        frame();
      }
    },
  };
}
