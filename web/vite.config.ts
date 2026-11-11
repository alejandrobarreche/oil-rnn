import { defineConfig } from "vitest/config";

export default defineConfig({
  // Rutas relativas: la web funciona igual en GitHub Pages (/<repo>/) que en local.
  base: "./",
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { environment: "node" },
});
