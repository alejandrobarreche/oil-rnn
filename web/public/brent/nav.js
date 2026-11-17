// Pestañas de «Cómo se hizo»: una vista por pestaña, rutas con almohadilla (#/datos) para que los
// enlaces, Atrás y Adelante funcionen. El cambio usa View Transitions: la vista sale hacia un lado y
// la nueva entra desde el otro según el orden de las pestañas. Cada pestaña empieza arriba.
(() => {
  const views = [...document.querySelectorAll("section[data-tab]")];
  const ids = views.map((v) => v.dataset.tab);
  const tabs = [...document.querySelectorAll(".tab")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cur = null;

  const idFromHash = () => {
    const h = location.hash.replace(/^#\/?/, "");
    return ids.includes(h) ? h : ids[0];
  };

  function apply(id) {
    views.forEach((v) => v.classList.toggle("is-on", v.dataset.tab === id));
    tabs.forEach((t) => (t.getAttribute("href") === `#/${id}` ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current")));
    document.documentElement.dataset.tab = id;
    const title = tabs.find((t) => t.getAttribute("href") === `#/${id}`)?.textContent.trim();
    document.title = id === ids[0] ? "El precio del Brent" : `${title}, el precio del Brent`;
    scrollTo(0, 0);
    document.querySelectorAll(".story__steps").forEach((l) => (l.scrollTop = 0));
    cur = id;
    dispatchEvent(new CustomEvent("tabchange", { detail: id }));
  }

  function go(id) {
    if (id === cur) return;
    const dir = ids.indexOf(id) >= ids.indexOf(cur) ? 1 : -1;
    document.documentElement.dataset.dir = String(dir);
    if (!document.startViewTransition || reduced || !cur) return apply(id);
    const vt = document.startViewTransition(() => apply(id));
    // Si la transición se cancela (p. ej. cambia el tamaño de la ventana), la vista ya está cambiada
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  }

  addEventListener("hashchange", () => go(idFromHash()));
  // Flechas izquierda y derecha cuando el foco está en una pestaña
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    n.focus();
    n.click();
  });
  apply(idFromHash());
})();
