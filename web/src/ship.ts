// Petrolero en foto, animado con un shader WebGL: el agua ondula, el barco cabecea un poco y, al
// cargar, la línea de flotación sube y tapa la franja roja (de la foto vacía a la cargada).
// Las fotos comparten encuadre (1584 × 672). Sin WebGL quedan las fotos fijas con un fundido
// por CSS; con movimiento reducido, el shader dibuja la foto quieta y la carga es inmediata.

const MAX_L = 330; // eslora de un VLCC, la mayor de la mesa (desk.ts)
const MIN_SCALE = 0.6;
const W = 1584;
const H = 672;
const LOAD_MS = 1300;

const IMG = {
  emptyLight: "img/barco-vacio-claro.jpg",
  fullLight: "img/barco-cargado-claro.jpg",
  emptyDark: null as string | null, // falta la foto: se usa la clara oscurecida
  fullDark: "img/barco-cargado-oscuro.jpg",
};

// Silueta del barco vacío en píxeles de la foto: lo que queda dentro no ondula, cabecea
const HULL: [number, number][] = [
  [245, 296], [298, 290], [300, 222], [318, 212], [320, 158], [372, 158], [372, 195], [390, 195],
  [390, 120], [430, 120], [430, 190], [512, 206], [512, 290], [718, 292], [720, 264], [908, 264],
  [908, 300], [1256, 330], [1258, 270], [1284, 270], [1286, 340], [1360, 350], [1354, 488],
  [1346, 516], [1100, 502], [800, 472], [500, 428], [278, 374], [248, 332],
];

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uA, uB, uM;
uniform float uT, uP, uMove, uDimA;
const vec2 RES = vec2(${W}.0, ${H}.0);

// Franja roja de la foto vacía (ajuste cuadrático medido sobre la imagen), en uv
float redTop(float x) { return (-0.16691 * x + 0.43953) * x + 0.45807; }
float redBot(float x) { return (-0.41725 * x + 0.72509) * x + 0.44341; }

vec3 dim(vec3 c) {
  c *= 0.42;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 0.7);
  return (c - 0.5) * 1.1 + 0.5;
}

void main() {
  vec2 q = vUv * RES;
  float m = texture2D(uM, vUv).r;
  float near = smoothstep(0.12, 0.95, vUv.y); // abajo está más cerca: ondas más grandes
  float k = 0.075 / (0.45 + vUv.y);         // y más largas
  float a = sin(q.x * k * 0.6 + q.y * k * 1.7 + uT * 1.3 + sin(q.x * k * 0.23 - uT * 0.6) * 2.0);
  float b = sin(-q.x * k * 0.4 + q.y * k * 2.4 - uT * 1.8 + sin(q.y * k * 0.5 + uT * 0.45) * 1.7);
  float c3 = sin(q.x * k * 1.3 - q.y * k * 0.9 + uT * 0.9 + a * 1.2); // rompe la regularidad
  vec2 water = vec2(a * 0.7 + c3 * 0.3, b + c3 * 0.4) * 1.3 * near * uMove * (1.0 - m);
  vec2 heave = vec2(0.0, sin(uT * 0.8) * 0.7 + sin(uT * 0.37 + 1.0) * 0.4) * uMove * m;
  vec2 uv = (q - water - heave) / RES;

  vec3 ca = texture2D(uA, uv).rgb;
  if (uDimA > 0.5) ca = dim(ca);
  vec3 cb = texture2D(uB, uv).rgb;

  // Carga: la foto cargada aparece de la flotación hacia arriba, como el agua que sube
  float top = redTop(vUv.x) - 14.0 / RES.y;
  float bot = redBot(vUv.x) + 8.0 / RES.y;
  float d = clamp((bot - vUv.y) / (bot - top), 0.0, 1.0);
  float mm = smoothstep(d - 0.12, d + 0.12, uP * 1.24 - 0.12);
  vec3 c = mix(ca, cb, mm);

  // Brillo del agua que se mueve con las ondas
  c *= 1.0 + 0.04 * a * b * c3 * near * near * uMove * (1.0 - m);
  gl_FragColor = vec4(c, 1.0);
}`;

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => ok(im);
    im.onerror = ko;
    im.src = src;
  });
}

/** Máscara de la silueta, difuminada, a un cuarto de resolución. */
function hullMask(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W / 4;
  c.height = H / 4;
  const g = c.getContext("2d");
  if (!g) return c;
  g.filter = "blur(2px)";
  g.fillStyle = "#fff";
  g.beginPath();
  HULL.forEach(([x, y], i) => (i ? g.lineTo(x / 4, y / 4) : g.moveTo(x / 4, y / 4)));
  g.closePath();
  g.fill();
  return c;
}

function createGL(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("shader");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const texs = ["uA", "uB", "uM"].map((name, unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u(name), unit);
    return t;
  });
  const uT = u("uT");
  const uP = u("uP");
  const uMove = u("uMove");
  const uDimA = u("uDimA");
  return {
    upload(unit: number, src: TexImageSource) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texs[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    },
    draw(t: number, p: number, move: number, dimA: boolean) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform1f(uP, p);
      gl.uniform1f(uMove, move);
      gl.uniform1f(uDimA, dimA ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

export function createShip() {
  const el = document.createElement("div");
  el.className = "ship";
  el.setAttribute("aria-hidden", "true");
  el.dataset.full = "false";
  const frame = document.createElement("div");
  frame.className = "ship-frame";
  // Fotos fijas: se ven hasta que el shader está listo, o siempre si no hay WebGL
  frame.innerHTML = `
    <img class="empty light" src="${IMG.emptyLight}" alt="" decoding="async" />
    <img class="full light" src="${IMG.fullLight}" alt="" decoding="async" />
    <img class="empty dark${IMG.emptyDark ? "" : " stand-in"}" src="${IMG.emptyDark ?? IMG.emptyLight}" alt="" decoding="async" />
    <img class="full dark" src="${IMG.fullDark}" alt="" decoding="async" />`;
  const canvas = document.createElement("canvas");
  frame.appendChild(canvas);
  el.appendChild(frame);

  let full = false;
  let p = 0; // 0 vacío, 1 cargado
  let from = 0;
  let t0 = 0;
  let visible = true;
  let raf = 0;
  let pair = "";
  let r: ReturnType<typeof createGL> = null;
  try {
    r = createGL(canvas);
  } catch {
    r = null;
  }

  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function tick(now: number) {
    raf = 0;
    if (!r || !pair) return;
    const move = reduced() ? 0 : 1;
    const target = full ? 1 : 0;
    if (p !== target) {
      const k = move ? Math.min(1, (now - t0) / LOAD_MS) : 1;
      p = k >= 1 ? target : from + (target - from) * ease(k);
    }
    resize();
    r.draw(now / 1000, p, move, isDark() && !IMG.emptyDark);
    // Sigue mientras se vea y haya movimiento o una carga en curso
    if (visible && !document.hidden && (move || p !== target)) raf = requestAnimationFrame(tick);
  }
  const kick = () => {
    if (!raf && r && pair) raf = requestAnimationFrame(tick);
  };

  async function setPair() {
    if (!r) return;
    const dark = isDark();
    const key = dark ? "dark" : "light";
    if (key === pair) return;
    const [a, b] = await Promise.all([
      loadImage(dark ? (IMG.emptyDark ?? IMG.emptyLight) : IMG.emptyLight),
      loadImage(dark ? IMG.fullDark : IMG.fullLight),
    ]);
    if ((isDark() ? "dark" : "light") !== key) return; // cambió el tema mientras cargaba
    r.upload(0, a);
    r.upload(1, b);
    pair = key;
    el.classList.add("gl");
    kick();
  }

  if (r) {
    r.upload(2, hullMask());
    void setPair();
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      kick();
    }).observe(el);
    document.addEventListener("visibilitychange", kick);
    new ResizeObserver(kick).observe(canvas);
  }

  return {
    el,
    /** Eslora en metros: escala la foto respecto al mayor petrolero. */
    size(lengthMeters: number) {
      const k = Math.max(MIN_SCALE, Math.min(1, lengthMeters / MAX_L));
      frame.style.setProperty("--k", k.toFixed(3));
    },
    /** Lleno o vacío: la flotación sube (o baja) en LOAD_MS. */
    load(next: boolean) {
      el.dataset.full = String(next);
      if (next === full) return;
      full = next;
      from = p;
      t0 = performance.now();
      kick();
    },
    /** Cambia el par de fotos al cambiar el tema. */
    theme() {
      void setPair();
    },
  };
}
