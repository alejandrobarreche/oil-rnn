// Versión WebAssembly (CPU): el .wasm se empaqueta con la web, sin depender de un CDN.
import * as ort from "onnxruntime-web/wasm";
import { type Manifest, parseCsv, predict, type Row, toCsv } from "./model";
import "./style.css";

ort.env.wasm.numThreads = 1; // GitHub Pages no permite memoria compartida entre hilos

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const fmt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 });

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`No se encuentra ${path}. Ejecuta \`make export-web\`.`);
  return res.json() as Promise<T>;
}

function describe(m: Manifest, values: number[]): string {
  if (m.task === "classification" && m.classes) {
    const best = values.indexOf(Math.max(...values));
    const probs = m.classes.map((c, i) => `${c}: ${fmt.format(values[i] * 100)} %`).join(" · ");
    return `${m.classes[best]}  (${probs})`;
  }
  const when = m.data_kind === "time_series" ? ` dentro de ${m.horizon} paso(s)` : "";
  return `${m.target}${when}: ${fmt.format(values[0])}`;
}

async function init() {
  const manifest = await loadJson<Manifest>("model/manifest.json");
  const examples = await loadJson<{ rows: Row[] }[]>("model/examples.json");
  const session = await ort.InferenceSession.create(`${base}model/${manifest.model_file}`);

  $("model-info").textContent =
    `Run ${manifest.run_id} · ${manifest.task === "classification" ? "clasificación" : "regresión"}` +
    ` · ${manifest.features.length} variables`;
  $("input-help").textContent =
    manifest.data_kind === "time_series"
      ? `CSV con cabecera y al menos ${(manifest.window ?? 1) + (manifest.warmup ?? 0)} filas ` +
        "(las más recientes al final). " +
        `Columnas: ${manifest.features.join(", ")}.`
      : `CSV con cabecera y una fila. Columnas: ${manifest.features.join(", ")}.`;

  const input = $<HTMLTextAreaElement>("input");
  const button = $<HTMLButtonElement>("predict");
  $("example").addEventListener("click", () => {
    input.value = toCsv(manifest, examples[0].rows);
  });
  button.disabled = false;
  button.addEventListener("click", async () => {
    try {
      const values = await predict(ort, session, manifest, parseCsv(manifest, input.value));
      $("output").textContent = describe(manifest, values);
    } catch (err) {
      $("output").textContent = (err as Error).message;
    }
  });
}

init().catch((err: Error) => {
  $("model-info").textContent = err.message;
});
