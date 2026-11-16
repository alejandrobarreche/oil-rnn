import { defineConfig } from "vitest/config";

export default defineConfig({
  // Rutas relativas: la web funciona igual en GitHub Pages (/<repo>/) que en local.
  base: "./",
  // Sonda (index.html); la página explicativa está en public/brent/ y se copia tal cual
  build: { rollupOptions: { input: { main: "index.html" } } },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { environment: "node" },
});
