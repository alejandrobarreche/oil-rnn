import { defineConfig } from "vitest/config";

export default defineConfig({
  // Rutas relativas: la web funciona igual en GitHub Pages (/<repo>/) que en local.
  base: "./",
  // Dos páginas: Sonda (index.html) y la página explicativa (explica.html)
  build: { rollupOptions: { input: { main: "index.html", explica: "explica.html" } } },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { environment: "node" },
});
