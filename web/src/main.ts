// Versión WebAssembly (CPU): el .wasm se empaqueta con la web, sin depender de un CDN.
// Página provisional de la fase 5 (paso 1): predice los cuatro horizontes con los últimos datos.
// La interfaz con el sistema de diseño Sonda llega en el paso 3.
import * as ort from "onnxruntime-web/wasm";
import { type Bundle, predict, type Row } from "./model";
import "./style.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

interface Market {
  asset: string;
  last: number;
  ts: string;
  rows: { t: string[]; values: Row[] };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const fmt = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

async function init() {
  const bundle = await loadJson<Bundle>("model/manifest.json");
  const market = await loadJson<Market>("data/market.json");
  $("model-info").textContent =
    `${market.asset} · último precio ${fmt.format(market.last)} $/bbl (${market.ts})`;
  const list = $("output");
  list.textContent = "";
  for (const m of bundle.models) {
    const session = await ort.InferenceSession.create(`${base}model/${m.model_file}`);
    const [lo, mid, hi] = await predict(ort, session, m, market.rows.values);
    const change = (mid / market.last - 1) * 100;
    const li = document.createElement("li");
    li.textContent =
      `${m.horizon} días (${m.cell?.toUpperCase()}): ${fmt.format(mid)} $/bbl ` +
      `(${change >= 0 ? "+" : "−"}${fmt.format(Math.abs(change))} %), ` +
      `intervalo del 80 %: ${fmt.format(lo)} – ${fmt.format(hi)}`;
    list.append(li);
  }
}

init().catch((err: Error) => {
  $("model-info").textContent = err.message;
});
