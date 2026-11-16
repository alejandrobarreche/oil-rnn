// Gota de crudo del panel de previsión: una esfera de vidrio llena de crudo hasta la probabilidad de
// subida. Three.js se carga de jsDelivr con la misma versión que la página del Brent (el mapa de
// importación está en index.html); si no carga, el panel se queda con las cifras, que dicen lo mismo.
/* eslint-disable @typescript-eslint/no-explicit-any */
const THREE_URL = "three";
const ROOM_URL = "three/addons/environments/RoomEnvironment.js";
const R = 0.94; // radio del crudo dentro del vidrio (radio 1)

interface Drop {
  canvas: HTMLCanvasElement;
  target: number; // nivel pedido, de 0 a 1
  kick: () => void;
}
let drop: Drop | null = null;

/** Coloca la gota en `host` y la lleva al nivel `level` (0 = vacía, 1 = llena). */
export function mountDrop(host: HTMLElement, level: number): void {
  if (!drop) drop = create();
  drop.target = Math.min(1, Math.max(0, level));
  host.appendChild(drop.canvas);
  drop.kick();
}

function create(): Drop {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const state: Drop = { canvas, target: 0.5, kick: () => {} };
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  void (async () => {
    let THREE: any;
    let Room: any;
    try {
      THREE = await import(/* @vite-ignore */ THREE_URL);
      Room = (await import(/* @vite-ignore */ ROOM_URL)).RoomEnvironment;
    } catch {
      canvas.remove();
      return;
    }
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.localClippingEnabled = true;
    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new Room(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 0.25, 4.6);
    camera.lookAt(0, 0, 0);

    // Crudo: el mismo material que la gota de la página del Brent, cortado por el plano del nivel
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const oil = new THREE.MeshPhysicalMaterial({
      color: 0x060607,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      iridescence: 0.55,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [180, 560],
      clippingPlanes: [plane],
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), oil));
    // Superficie del crudo: un disco en el corte
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.08, clearcoat: 1, iridescence: 0.7, iridescenceIOR: 1.32 }),
    );
    scene.add(top);
    // Vidrio
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, clearcoat: 1, transparent: true, opacity: 0.16, depthWrite: false }),
      ),
    );

    let level = state.target;
    let slosh = 0; // balanceo que se apaga tras un cambio de nivel
    let last = performance.now();
    let running = false;
    const zAxis = new THREE.Vector3(0, 0, 1);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const before = level;
      level += (state.target - level) * (still ? 1 : 1 - Math.exp(-dt * 5));
      slosh = still ? 0 : slosh * Math.exp(-dt * 2.2) + Math.abs(level - before) * 3;
      const tilt = still ? 0 : Math.sin(now / 760) * (0.03 + Math.min(0.22, slosh));
      const c = -R + 2 * R * level; // altura del nivel: la fracción de altura es la probabilidad
      plane.normal.set(-Math.sin(tilt), -Math.cos(tilt), 0);
      plane.constant = c;
      const r = Math.sqrt(Math.max(0, R * R - c * c));
      top.visible = r > 0.02;
      top.scale.setScalar(r);
      top.position.copy(plane.normal).multiplyScalar(-c);
      top.quaternion.setFromUnitVectors(zAxis, plane.normal.clone().negate());

      const size = canvas.clientWidth || 132;
      if (canvas.width !== Math.round(size * renderer.getPixelRatio())) renderer.setSize(size, size, false);
      renderer.render(scene, camera);
      running = !still && canvas.isConnected && !document.hidden;
      if (running) requestAnimationFrame(frame);
    };
    state.kick = () => {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", () => state.kick());
    state.kick();
  })();
  return state;
}
