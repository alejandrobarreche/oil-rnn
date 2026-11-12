/* Sonda — librería de vista previa. Gráficos SVG sin dependencias + constructores HTML + datos de ejemplo.
   window.Sonda = { data, fmt, charts, ui, hydrate }.
   Los datos son SIMULADOS (semilla fija): sustitúyelos por la salida de tus modelos con la misma forma. */
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- utilidades ---------- */
  function rng(seed) { var s = (seed * 2654435761) >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }
  function phi(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function el(t, a) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function txt(t, a, s) { var e = el(t, a); e.textContent = s; return e; }
  function num(v, dp) { if (v == null || isNaN(v)) return '—'; dp = dp == null ? 2 : dp; return v.toLocaleString('es-ES', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: true }); }
  function signed(v, dp, suf) { var s = v > 0 ? '+' : v < 0 ? '−' : ''; return s + num(Math.abs(v), dp) + (suf || ''); }
  function pct(v, dp) { return num(v * 100, dp == null ? 0 : dp) + '\u202f%'; }
  /* ---------- iconos: rejilla 16 px, trazo 1,5, extremos redondeados. Regla: lo sólido es real, la apertura en abanico es lo previsto ---------- */
  var F = ' fill="currentColor" stroke="none"', D = ' stroke-dasharray="0 2.6"';
  var ICONS = {
    /* estados: mini-gráficos. La línea es el dato, el punto es ahora */
    'st-live': '<path d="M1.5 12 4.5 9l3 1.5 5-5"/><circle cx="12.5" cy="5.5" r="2.4"' + F + '/>',
    'st-delayed': '<path d="M1.5 12 4.5 9l3 1.5"/><path d="M10 10.5h1"' + D + '/><circle cx="13.5" cy="10.5" r="1.8"/>',
    'st-off': '<path d="M1.5 9.5h13"' + D + '/>',
    'st-armed': '<path d="M1.5 3.5h13" stroke-width="1" stroke-dasharray="1.5 1.75"/><path d="M1.5 13.5 5 11l3 1.5 3-2.5"/><circle cx="12.5" cy="9.5" r="1.8"/>',
    'st-fired': '<path d="M1.5 7.5h13" stroke-width="1" stroke-dasharray="1.5 1.75"/><path d="M1.5 13.5 5 11l3 1 3.2-6.5"/><circle cx="12.5" cy="3.5" r="2.4"' + F + '/>',
    'st-warn': '<path d="M7.5 8.5 14.5 1.5v14z" fill="currentColor" stroke="none" opacity=".18"/><path d="M1.5 9 4.5 8l3 .5M7.5 8.5l7-7M7.5 8.5l7 7"/><circle cx="7.5" cy="8.5" r="1.5"' + F + '/>',
    up: '<path d="M3.5 12.5 12 4M6.5 4H12v5.5"/>',
    down: '<path d="M3.5 3.5 12 12M12 6.5V12H6.5"/>',
    flat: '<path d="M2.5 8H13M9.5 4.5 13 8l-3.5 3.5"/>',
    bell: '<path d="M4 11V7.5a4 4 0 0 1 8 0V11l1.5 1.5h-11z"/><path d="M6.5 14.5h3"/>',
    forecast: '<path d="M1.5 11.5 4.5 8.5l2.5 1.5 1.5-1.5"/><path d="M8.5 8.5 14.5 4v9z"/><circle cx="8.5" cy="8.5" r="1.5"' + F + '/>',
    models: '<path d="M8 2 14 5 8 8 2 5z"/><path d="m2 8 6 3 6-3M2 11l6 3 6-3"/>',
    backtest: '<path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M4.5 2v2.5H7"/><path d="M8 5.5V8l1.8 1.2"/>',
    run: '<path d="M5 3 13 8l-8 5z"/>',
    export: '<path d="M8 2v8M4.5 5.5 8 2l3.5 3.5M3 10v3.5h10V10"/>',
    settings: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/><circle cx="5" cy="4.5" r="1.75"' + F + '/><circle cx="10.5" cy="8" r="1.75"' + F + '/><circle cx="7" cy="11.5" r="1.75"' + F + '/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>',
    filter: '<path d="M2.5 3h11l-4 5v5l-3-1.5V8z"/>',
    detach: '<path d="M9 2.5h4.5V7M13.5 2.5 8 8M11.5 9.5v4h-9v-9h4"/>',
    expand: '<path d="M9.5 2.5h4v4M13.5 2.5l-4 4M6.5 13.5h-4v-4M2.5 13.5l4-4"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5V11"/><circle cx="8" cy="5" r=".9"' + F + '/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5"/>',
    asset: '<ellipse cx="8" cy="4" rx="5" ry="1.75"/><path d="M3 4v8a5 1.75 0 0 0 10 0V4M3 8a5 1.75 0 0 0 10 0"/>',
    drivers: '<path d="M8 2v12"/><path d="M8 3.5h5v2.5H8M8 10H3.5v2.5H8"/>',
    interval: '<path d="M2.5 8h11M4 5.5v5M12 5.5v5"/><rect x="7" y="6.5" width="2" height="3" rx=".5"' + F + '/>',
    curve: '<path d="M2.5 4.5c4.5 0 6.5 7 11 7"/><circle cx="2.5" cy="4.5" r="1.6"' + F + '/><circle cx="8" cy="8" r="1.6"' + F + '/><circle cx="13.5" cy="11.5" r="1.6"' + F + '/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2.5V5h-2.5"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    close: '<path d="m4 4 8 8M12 4l-8 8"/>',
    chevron: '<path d="m4 6 4 4 4-4"/>'
  };
  function icon(name, o) {
    o = o || {}; var s = o.size || 16;
    return '<svg class="bx-icon' + (o.cls ? ' ' + o.cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="' + (o.stroke || 1.5) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }
  /* logo: trazo real que se abre en el abanico de la previsión */
  function logo(o) {
    o = o || {}; var s = o.size || 24;
    var mark = '<svg class="bx-logo-mark" width="' + s + '" height="' + s + '" viewBox="0 0 32 32" aria-hidden="true">' +
      '<polygon class="bx-logo-band" points="15,17 30,6 30,28"/><polygon class="bx-logo-core" points="15,17 30,12 30,22"/>' +
      '<path class="bx-logo-real" d="M2.5 22 7.5 16.5 11 18.5 15 17" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle class="bx-logo-dot" cx="15" cy="17" r="3"/></svg>';
    return o.markOnly ? mark : '<span class="bx-logo' + (o.mono ? ' bx-logo-mono' : '') + '" style="font-size:' + Math.round(s * 0.66) + 'px">' + mark + '<span class="bx-logo-word">Sonda</span></span>';
  }
  /* marca de agua: roseta guilloché (hipotrocoides superpuestas), como en los billetes */
  function rosette(size) {
    var paths = [4.2, 3.4, 2.6].map(function (d) {
      var pts = [], R = 8, r = 3, k = (R - r) / r;
      for (var i = 0; i <= 720; i++) { var t = i / 720 * 6 * Math.PI; pts.push(((R - r) * Math.cos(t) + d * Math.cos(k * t)).toFixed(2) + ' ' + ((R - r) * Math.sin(t) - d * Math.sin(k * t)).toFixed(2)); }
      return '<path d="M' + pts.join('L') + '"/>';
    }).join('');
    return '<svg width="' + size + '" height="' + size + '" viewBox="-9.5 -9.5 19 19" fill="none" stroke="currentColor" stroke-width=".06" aria-hidden="true">' + paths + '</svg>';
  }
  function arrow(v, s) { return icon(v > 0 ? 'up' : v < 0 ? 'down' : 'flat', { size: s || 11, stroke: 2.25 }); }
  function dir(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }
  function ticks(min, max, n) { var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / n))), e = span / n / step; if (e >= 7.5) step *= 10; else if (e >= 3.5) step *= 5; else if (e >= 1.5) step *= 2; var t = [], v = Math.ceil(min / step) * step; for (; v <= max + 1e-9; v += step) t.push(+v.toFixed(6)); return t; }
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var BASE = new Date(2026, 10, 5, 14, 30);
  function tradingDay(offset) { var d = new Date(BASE), step = offset < 0 ? -1 : 1, n = Math.abs(offset); while (n > 0) { d.setDate(d.getDate() + step); if (d.getDay() !== 0 && d.getDay() !== 6) n--; } return d; }
  function dLabel(d) { return d.getDate() + ' ' + MES[d.getMonth()]; }
  function tLabel(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  /* ---------- datos de ejemplo ---------- */
  var assets = [
    { id: 'BRENT', name: 'Brent', venue: 'ICE · ene 27', last: 71.84, chg: 0.44, vol: 0.018, mu: 0.0007, seed: 7, unit: '$/bbl' },
    { id: 'WTI', name: 'WTI', venue: 'NYMEX · dic 26', last: 67.92, chg: 0.31, vol: 0.020, mu: 0.0005, seed: 11, unit: '$/bbl' },
    { id: 'DUBAI', name: 'Dubai', venue: 'Platts · ene 27', last: 70.15, chg: -0.12, vol: 0.017, mu: -0.0004, seed: 3, unit: '$/bbl' },
    { id: 'SPREAD', name: 'Brent–WTI', venue: 'Diferencial', last: 3.92, chg: 0.13, vol: 0.045, mu: 0.0030, seed: 5, unit: '$/bbl' }
  ];
  var horizons = [
    { id: 'intra', label: 'Intradía', short: '4 h', steps: 8, hist: 40, stepDays: 1 / 16, kind: 'time' },
    { id: '1d', label: '1 día', short: '1D', steps: 1, hist: 30, stepDays: 1, kind: 'day' },
    { id: '1w', label: '1 semana', short: '1S', steps: 5, hist: 45, stepDays: 1, kind: 'day' },
    { id: '1m', label: '1 mes', short: '1M', steps: 21, hist: 70, stepDays: 1, kind: 'day' },
    { id: '3m', label: '3 meses', short: '3M', steps: 63, hist: 120, stepDays: 1, kind: 'day' }
  ];
  function A(id) { return assets.filter(function (a) { return a.id === id; })[0] || assets[0]; }
  function Hz(id) { return horizons.filter(function (h) { return h.id === id; })[0] || horizons[3]; }

  /* predicción resumida para un activo y un horizonte */
  function predict(aid, hid, model) {
    var a = A(aid), h = Hz(hid), d = h.steps * h.stepDays, m = model || 0;
    var mu = a.mu + (m === 1 ? 0.0004 : m === 2 ? -0.0006 : m === 3 ? 0.0002 : 0);
    var mid = a.last * (1 + mu * d), s = a.last * a.vol * Math.sqrt(d) * (m === 2 ? 0.85 : 1);
    return { asset: a, horizon: h, last: a.last, mid: mid, lo80: mid - 1.2816 * s, hi80: mid + 1.2816 * s, lo95: mid - 1.96 * s, hi95: mid + 1.96 * s, delta: mid - a.last, deltaPct: (mid - a.last) / a.last, pUp: phi((mid - a.last) / (s * 0.9)), sigma: s };
  }

  /* serie completa: histórico + trayectoria prevista con bandas */
  function path(aid, hid, model) {
    var a = A(aid), h = Hz(hid), r = rng(a.seed * 31 + h.steps), hist = [], v = 0, i;
    for (i = 0; i < h.hist; i++) { v += gauss(r) * a.vol * Math.sqrt(h.stepDays) * a.last * 0.9 + (i > h.hist * 0.6 ? a.mu * a.last * h.stepDays * 3 : 0); hist.push(v); }
    var shift = a.last - hist[hist.length - 1]; hist = hist.map(function (x) { return x + shift; });
    var p = predict(aid, hid, model), fc = [], rf = rng(a.seed * 97 + (model || 0) * 13 + h.steps);
    var wig = 0;
    for (i = 1; i <= h.steps; i++) { var f = i / h.steps; wig = wig * 0.7 + gauss(rf) * a.vol * a.last * 0.08; var mid = a.last + (p.mid - a.last) * f + wig * (1 - f); var s = p.sigma * Math.sqrt(f); fc.push({ mid: mid, lo80: mid - 1.2816 * s, hi80: mid + 1.2816 * s, lo95: mid - 1.96 * s, hi95: mid + 1.96 * s }); }
    var labels = [];
    for (i = 0; i < h.hist + h.steps; i++) { var off = i - (h.hist - 1); if (h.kind === 'time') { var t = new Date(BASE.getTime() + off * 30 * 60000); labels.push(tLabel(t)); } else labels.push(dLabel(tradingDay(off))); }
    return { asset: a, horizon: h, history: hist, forecast: fc, labels: labels, summary: p };
  }

  /* backtest: real vs previsto a 1 día, con intervalo 80 % */
  function backtest(aid, n) {
    var a = A(aid), r = rng(a.seed * 7 + 1), act = [], pred = [], lo = [], hi = [], v = a.last - 2.4, i;
    n = n || 60;
    for (i = 0; i < n; i++) { v += gauss(r) * a.vol * a.last * 0.9; act.push(v); }
    var shift = a.last - act[n - 1]; act = act.map(function (x) { return x + shift; });
    for (i = 0; i < n; i++) { var prev = i ? act[i - 1] : act[0]; var p = prev + (act[i] - prev) * 0.35 + gauss(r) * a.vol * a.last * 0.25; var s = a.vol * a.last * 1.0; pred.push(p); lo.push(p - 1.2816 * s); hi.push(p + 1.2816 * s); }
    var hits = 0, inBand = 0, ae = 0, se = 0;
    for (i = 1; i < n; i++) { var dA = act[i] - act[i - 1], dP = pred[i] - act[i - 1]; if ((dA > 0) === (dP > 0)) hits++; if (act[i] >= lo[i] && act[i] <= hi[i]) inBand++; ae += Math.abs(act[i] - pred[i]); se += Math.pow(act[i] - pred[i], 2); }
    var labels = []; for (i = 0; i < n; i++) labels.push(dLabel(tradingDay(i - (n - 1))));
    return { actual: act, predicted: pred, lo: lo, hi: hi, labels: labels, hitRate: hits / (n - 1), coverage: inBand / (n - 1), mae: ae / (n - 1), rmse: Math.sqrt(se / (n - 1)) };
  }

  var models = [
    { id: 'm1', name: 'Ensemble GBM', tag: 'Producción', version: 'v3.2' },
    { id: 'm2', name: 'LSTM multivariante', tag: 'Candidato', version: 'v1.4' },
    { id: 'm3', name: 'ARIMAX', tag: 'Referencia', version: 'v2.0' },
    { id: 'm4', name: 'Temporal Fusion', tag: 'Experimental', version: 'v0.9' }
  ];

  var drivers = [
    { name: 'Inventarios EIA', detail: '−3,1 M bbl vs −1,2 M esperado', value: 0.82 },
    { name: 'Recortes OPEP+', detail: 'Prórroga hasta T1 27', value: 0.64 },
    { name: 'Crack spread 3-2-1', detail: '24,8 $ · percentil 71', value: 0.31 },
    { name: 'Posicionamiento CFTC', detail: 'Largos netos −8 % sem.', value: -0.22 },
    { name: 'Índice dólar (DXY)', detail: '104,6 · +0,4 % sem.', value: -0.41 },
    { name: 'Demanda China', detail: 'Importaciones oct. −2,3 % a/a', value: -0.57 }
  ];

  var curveMonths = ['dic 26', 'ene 27', 'feb 27', 'mar 27', 'abr 27', 'may 27', 'jun 27', 'jul 27', 'ago 27', 'sep 27', 'oct 27', 'nov 27', 'dic 27'];
  function curve(aid) {
    var a = A(aid), now = [], fut = [], lo = [], hi = [];
    for (var i = 0; i < curveMonths.length; i++) { var c = a.last + 0.35 - i * 0.28 + Math.pow(i, 1.6) * 0.012; now.push(c); var f = c + 1.2 - i * 0.06; var s = a.last * a.vol * Math.sqrt(21) * 0.35 * (1 + i * 0.04); fut.push(f); lo.push(f - 1.2816 * s); hi.push(f + 1.2816 * s); }
    return { months: curveMonths, now: now, predicted: fut, lo: lo, hi: hi };
  }

  var alerts = [
    { asset: 'BRENT', rule: 'Previsión 1S cruza 73,00', state: 'fired', when: 'hace 4 min', value: '73,12' },
    { asset: 'WTI', rule: 'Prob. subida 1D > 65 %', state: 'armed', when: 'activa', value: '58 %' },
    { asset: 'SPREAD', rule: 'Diferencial previsto 1M > 4,50', state: 'armed', when: 'activa', value: '4,28' },
    { asset: 'BRENT', rule: 'Cobertura 80 % < 75 % (30 d)', state: 'fired', when: 'hace 1 h', value: '72 %' }
  ];

  /* ---------- motor de gráfico de líneas ---------- */
  function mount(host, render) {
    render();
    if (window.ResizeObserver) { var w = host.clientWidth; new ResizeObserver(function () { if (Math.abs(host.clientWidth - w) > 2) { w = host.clientWidth; render(); } }).observe(host); }
  }

  /* o = { n, height, series:[{values, offset, cls}], bands:[{lo, hi, offset, cls}], now, labels, every, dp, tags:[{value, cls, text}], tooltip(i), axisRight, markers:[{i, v, cls}], yPad } */
  function lineChart(host, o) {
    host.classList.add('bx-chart'); host.innerHTML = '';
    var W = Math.max(host.clientWidth || o.width || 640, 200), H = o.height || 280;
    var pl = o.axisRight === false ? 4 : 8, pr = o.axisRight === false ? 4 : 64, pt = 10, pb = o.labels ? 24 : 6, n = o.n;
    var vals = [];
    (o.series || []).forEach(function (s) { s.values.forEach(function (v) { if (v != null) vals.push(v); }); });
    (o.bands || []).forEach(function (b) { b.lo.forEach(function (v) { vals.push(v); }); b.hi.forEach(function (v) { vals.push(v); }); });
    var min = Math.min.apply(0, vals), max = Math.max.apply(0, vals), pad = (max - min) * (o.yPad == null ? 0.08 : o.yPad) || 1; min -= pad; max += pad;
    var X = function (i) { return pl + (W - pl - pr) * (i / Math.max(n - 1, 1)); };
    var Y = function (v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min)); };
    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.label || 'Gráfico' });
    if (o.now != null) {
      svg.appendChild(el('rect', { x: X(o.now), y: pt, width: W - pr - X(o.now), height: H - pt - pb, class: 'bx-future' }));
    }
    var g = el('g', { class: 'bx-grid' });
    ticks(min, max, o.ticks || 5).forEach(function (t) {
      g.appendChild(el('line', { x1: pl, x2: W - pr, y1: Y(t), y2: Y(t) }));
      if (o.axisRight !== false) g.appendChild(txt('text', { x: W - pr + 8, y: Y(t) + 4, class: 'bx-axis' }, num(t, o.dp == null ? 2 : o.dp)));
    });
    svg.appendChild(g);
    if (o.labels) {
      var every = Math.max(o.every || 1, Math.ceil(n / Math.max(2, Math.floor((W - pl - pr) / 72))));
      for (var i = 0; i < n; i++) if ((n - 1 - i) % every === 0 || (o.now != null && i === o.now)) {
        if (o.now != null && i !== o.now && Math.abs(i - o.now) < every * 0.6) continue;
        svg.appendChild(txt('text', { x: X(i), y: H - 6, class: 'bx-axis', 'text-anchor': i === 0 ? 'start' : 'middle' }, o.labels[i]));
      }
    }
    (o.bands || []).forEach(function (b) {
      var d = '', k;
      for (k = 0; k < b.hi.length; k++) d += (k ? 'L' : 'M') + X(b.offset + k).toFixed(1) + ',' + Y(b.hi[k]).toFixed(1);
      for (k = b.lo.length - 1; k >= 0; k--) d += 'L' + X(b.offset + k).toFixed(1) + ',' + Y(b.lo[k]).toFixed(1);
      svg.appendChild(el('path', { d: d + 'Z', class: b.cls }));
    });
    if (o.now != null) {
      svg.appendChild(el('line', { x1: X(o.now), x2: X(o.now), y1: pt, y2: H - pb, class: 'bx-now' }));
      svg.appendChild(txt('text', { x: X(o.now) + 6, y: pt + 12, class: 'bx-now-label' }, o.nowLabel || 'Ahora'));
    }
    (o.series || []).forEach(function (s) {
      var d = '', started = false;
      s.values.forEach(function (v, k) { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + X((s.offset || 0) + k).toFixed(1) + ',' + Y(v).toFixed(1); started = true; });
      svg.appendChild(el('path', { d: d, class: 'bx-line ' + s.cls }));
    });
    (o.markers || []).forEach(function (m) { svg.appendChild(el('circle', { cx: X(m.i), cy: Y(m.v), r: 4, class: 'bx-marker ' + (m.cls || '') })); });
    var tg = (o.tags || []).map(function (t) { return { t: t, y: Y(t.value) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var q = 1; q < tg.length; q++) if (tg[q].y - tg[q - 1].y < 19) tg[q].y = tg[q - 1].y + 19;
    var over = tg.length ? tg[tg.length - 1].y - (H - pb - 9) : 0;
    if (over > 0) tg.forEach(function (x) { x.y -= over; });
    tg.forEach(function (x) {
      if (o.axisRight === false) return;
      var t = x.t, gy = x.y, gg = el('g', { class: 'bx-tag ' + t.cls });
      gg.appendChild(el('rect', { x: W - pr + 2, y: gy - 9, width: pr - 4, height: 18, rx: 3 }));
      gg.appendChild(txt('text', { x: W - pr + 8, y: gy + 4 }, t.text || num(t.value, o.dp == null ? 2 : o.dp)));
      svg.appendChild(gg);
    });
    host.appendChild(svg);
    if (o.animate) {
      svg.classList.add('bx-anim');
      svg.querySelectorAll('.bx-line.bx-actual').forEach(function (pth) { var L = pth.getTotalLength(); pth.style.strokeDasharray = L; pth.style.strokeDashoffset = L; });
    }
    if (o.tooltip) {
      var cross = el('line', { class: 'bx-cross', y1: pt, y2: H - pb, x1: 0, x2: 0, visibility: 'hidden' });
      var dot = el('circle', { class: 'bx-cross-dot', r: 4, visibility: 'hidden' });
      svg.appendChild(cross); svg.appendChild(dot);
      var tip = document.createElement('div'); tip.className = 'bx-tip'; host.appendChild(tip);
      var hit = el('rect', { x: pl, y: pt, width: W - pl - pr, height: H - pt - pb, fill: '#ffffff', 'fill-opacity': 0 });
      svg.appendChild(hit);
      hit.addEventListener('mousemove', function (e) {
        var rect = svg.getBoundingClientRect(), mx = (e.clientX - rect.left) * (W / rect.width);
        var i = Math.max(0, Math.min(n - 1, Math.round((mx - pl) / (W - pl - pr) * (n - 1))));
        var info = o.tooltip(i); if (!info) return;
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
        if (info.v != null) { dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(info.v)); dot.setAttribute('visibility', 'visible'); }
        tip.innerHTML = info.html; tip.style.display = 'block';
        var left = X(i) + 14; if (left + tip.offsetWidth > W - pr) left = X(i) - 14 - tip.offsetWidth;
        tip.style.left = left + 'px'; tip.style.top = pt + 'px';
      });
      hit.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
    }
    return { X: X, Y: Y, W: W, H: H };
  }

  function tipRow(label, value, cls) { return '<div class="bx-tip-row"><span>' + (cls ? '<i class="bx-key ' + cls + '"></i>' : '') + label + '</span><b>' + value + '</b></div>'; }

  /* ---------- gráficos de dominio ---------- */
  function forecastChart(host, o) {
    o = o || {};
    var first = true;
    mount(host, function () {
      var p = path(o.asset || 'BRENT', o.horizon || '1m', o.model), h = p.history, f = p.forecast, off = h.length - 1, last = h[off];
      var mid = [last].concat(f.map(function (x) { return x.mid; }));
      var bands = [], show = o.bands || 'both';
      if (show === 'both' || show === '95') bands.push({ lo: [last].concat(f.map(function (x) { return x.lo95; })), hi: [last].concat(f.map(function (x) { return x.hi95; })), offset: off, cls: 'bx-band95' });
      if (show === 'both' || show === '80') bands.push({ lo: [last].concat(f.map(function (x) { return x.lo80; })), hi: [last].concat(f.map(function (x) { return x.hi80; })), offset: off, cls: 'bx-band80' });
      var end = f[f.length - 1];
      lineChart(host, {
        n: h.length + f.length, height: o.height || 320, now: off, labels: p.labels, label: 'Predicción ' + p.asset.name + ' ' + p.horizon.label, animate: o.animate !== false && first,
        series: [{ values: h, offset: 0, cls: 'bx-actual' }, { values: mid, offset: off, cls: 'bx-fc' }],
        bands: bands, ticks: o.ticks,
        tags: o.tags === false ? [] : [{ value: last, cls: 'bx-tag-actual' }, { value: end.mid, cls: 'bx-tag-fc' }],
        tooltip: function (i) {
          if (i <= off) return { v: h[i], html: '<div class="bx-tip-h">' + p.labels[i] + '</div>' + tipRow('Real', num(h[i]), 'bx-actual') };
          var x = f[i - off - 1];
          return { v: x.mid, html: '<div class="bx-tip-h">' + p.labels[i] + ' · previsto</div>' + tipRow('Central', num(x.mid), 'bx-fc') + tipRow('80 %', num(x.lo80) + ' – ' + num(x.hi80), 'bx-band80') + tipRow('95 %', num(x.lo95) + ' – ' + num(x.hi95), 'bx-band95') };
        }
      });
      first = false;
    });
  }

  function backtestChart(host, o) {
    o = o || {};
    mount(host, function () {
      var b = backtest(o.asset || 'BRENT', o.n || 60), misses = [];
      b.actual.forEach(function (v, i) { if (i && (v < b.lo[i] || v > b.hi[i])) misses.push({ i: i, v: v, cls: 'bx-miss' }); });
      lineChart(host, {
        n: b.actual.length, height: o.height || 220, labels: b.labels, label: 'Backtest: real frente a previsto',
        bands: [{ lo: b.lo, hi: b.hi, offset: 0, cls: 'bx-band80' }],
        series: [{ values: b.predicted, cls: 'bx-fc' }, { values: b.actual, cls: 'bx-actual' }], markers: misses,
        tooltip: function (i) { var err = b.actual[i] - b.predicted[i]; return { v: b.actual[i], html: '<div class="bx-tip-h">' + b.labels[i] + '</div>' + tipRow('Real', num(b.actual[i]), 'bx-actual') + tipRow('Previsto', num(b.predicted[i]), 'bx-fc') + tipRow('Error', signed(err, 2)) + (b.actual[i] < b.lo[i] || b.actual[i] > b.hi[i] ? '<div class="bx-tip-note">Fuera del intervalo 80 %</div>' : '') }; }
      });
    });
  }

  function compareChart(host, o) {
    o = o || {};
    mount(host, function () {
      var ms = o.models || [0, 1, 2, 3], base = path(o.asset || 'BRENT', o.horizon || '1m', 0), off = base.history.length - 1, last = base.history[off];
      var hist = base.history.slice(-Math.min(30, base.history.length)), cut = base.history.length - hist.length;
      var series = [{ values: hist, offset: 0, cls: 'bx-actual' }], paths = [];
      ms.forEach(function (m) { var p = path(o.asset || 'BRENT', o.horizon || '1m', m); paths.push(p); series.push({ values: [last].concat(p.forecast.map(function (x) { return x.mid; })), offset: off - cut, cls: 'bx-s' + (m + 1) }); });
      var labels = base.labels.slice(cut);
      lineChart(host, {
        n: hist.length + base.forecast.length, height: o.height || 260, now: off - cut, labels: labels, series: series, label: 'Comparación de modelos',
        tags: paths.map(function (p, k) { return { value: p.forecast[p.forecast.length - 1].mid, cls: 'bx-tag-s' + (ms[k] + 1) }; }),
        tooltip: function (i) {
          if (i <= off - cut) return { v: hist[i], html: '<div class="bx-tip-h">' + labels[i] + '</div>' + tipRow('Real', num(hist[i]), 'bx-actual') };
          var html = '<div class="bx-tip-h">' + labels[i] + ' · previsto</div>';
          paths.forEach(function (p, k) { html += tipRow(models[ms[k]].name, num(p.forecast[i - (off - cut) - 1].mid), 'bx-s' + (ms[k] + 1)); });
          return { html: html };
        }
      });
    });
  }

  function curveChart(host, o) {
    o = o || {};
    mount(host, function () {
      var c = curve(o.asset || 'BRENT');
      lineChart(host, {
        n: c.months.length, height: o.height || 220, labels: c.months, every: 2, label: 'Curva de futuros', yPad: 0.12,
        bands: [{ lo: c.lo, hi: c.hi, offset: 0, cls: 'bx-band80' }],
        series: [{ values: c.now, cls: 'bx-actual' }, { values: c.predicted, cls: 'bx-fc' }],
        markers: c.now.map(function (v, i) { return { i: i, v: v, cls: 'bx-dot-actual' }; }),
        tooltip: function (i) { return { v: c.predicted[i], html: '<div class="bx-tip-h">Contrato ' + c.months[i] + '</div>' + tipRow('Hoy', num(c.now[i]), 'bx-actual') + tipRow('Previsto 1M', num(c.predicted[i]), 'bx-fc') + tipRow('80 %', num(c.lo[i]) + ' – ' + num(c.hi[i]), 'bx-band80') }; }
      });
    });
  }

  function sparkline(host, o) {
    o = o || {};
    var p = path(o.asset || 'BRENT', o.horizon || '1w'), vals = p.history.slice(-(o.points || 30)), fc = o.forecast === false ? [] : p.forecast.map(function (x) { return x.mid; });
    var all = vals.concat(fc), W = o.width || 96, H = o.height || 28, min = Math.min.apply(0, all), max = Math.max.apply(0, all), n = all.length;
    var X = function (i) { return 1 + (W - 2) * i / (n - 1); }, Y = function (v) { return 2 + (H - 4) * (1 - (v - min) / ((max - min) || 1)); };
    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'bx-spark', 'aria-hidden': 'true' });
    var d = ''; vals.forEach(function (v, i) { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
    svg.appendChild(el('path', { d: d, class: 'bx-line bx-spark-' + dir(p.summary.delta) }));
    if (fc.length) { var d2 = 'M' + X(vals.length - 1).toFixed(1) + ',' + Y(vals[vals.length - 1]).toFixed(1); fc.forEach(function (v, i) { d2 += 'L' + X(vals.length + i).toFixed(1) + ',' + Y(v).toFixed(1); }); svg.appendChild(el('path', { d: d2, class: 'bx-line bx-fc bx-spark-fc' })); }
    host.innerHTML = ''; host.appendChild(svg);
  }

  /* barra de intervalo: 95 % · 80 % · central · último precio, sobre un dominio común */
  function intervalBar(host, o) {
    var p = o.p || predict(o.asset || 'BRENT', o.horizon || '1m'), W = o.width || host.clientWidth || 160, H = o.height || 18;
    var dmin = o.min != null ? o.min : p.lo95, dmax = o.max != null ? o.max : p.hi95, pad = (dmax - dmin) * 0.04;
    dmin -= pad; dmax += pad;
    var X = function (v) { return (W - 2) * (v - dmin) / (dmax - dmin) + 1; }, cy = H / 2;
    var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'bx-ib', role: 'img', 'aria-label': 'Intervalo 80 % ' + num(p.lo80) + ' a ' + num(p.hi80) + ', central ' + num(p.mid) });
    svg.appendChild(el('rect', { x: X(p.lo95), y: cy - 4, width: X(p.hi95) - X(p.lo95), height: 8, rx: 2, class: 'bx-band95' }));
    svg.appendChild(el('rect', { x: X(p.lo80), y: cy - 4, width: X(p.hi80) - X(p.lo80), height: 8, rx: 2, class: 'bx-band80' }));
    svg.appendChild(el('line', { x1: X(p.last), x2: X(p.last), y1: 1, y2: H - 1, class: 'bx-ib-last' }));
    svg.appendChild(el('rect', { x: X(p.mid) - 1.5, y: cy - 6, width: 3, height: 12, rx: 1, class: 'bx-ib-mid' }));
    host.innerHTML = ''; host.appendChild(svg);
  }

  var charts = { lineChart: lineChart, forecast: forecastChart, backtest: backtestChart, compare: compareChart, curve: curveChart, spark: sparkline, interval: intervalBar };

  /* ---------- constructores HTML ---------- */
  function chg(v, pctv, dp) { return '<span class="bx-chg bx-' + dir(v) + '"><span class="bx-arrow" aria-hidden="true">' + arrow(v) + '</span>' + signed(v, dp == null ? 2 : dp) + (pctv != null ? ' <span class="bx-chg-pct">(' + signed(pctv * 100, 2, '\u202f%') + ')</span>' : '') + '</span>'; }

  var ui = {
    chg: chg,
    badge: function (text, tone) { return '<span class="bx-badge bx-badge-' + (tone || 'neutral') + '">' + text + '</span>'; },
    icon: icon, logo: logo, arrow: arrow, rosette: rosette, icons: Object.keys(ICONS),
    primary: function (label, ic, kbd) { return '<button class="bx-btn bx-btn-primary">' + label + (kbd ? '<span class="bx-kbd">' + kbd + '</span>' : '') + '<span class="bx-btn-end">' + icon(ic || 'run', { size: 11, stroke: 2 }) + '</span></button>'; },
    cmd: function (ic, label, kbd) { return '<button class="bx-btn">' + icon(ic) + label + (kbd ? '<span class="bx-kbd">' + kbd + '</span>' : '') + '</button>'; },
    bar: function (label, ic) { return '<button class="bx-btn bx-btn-bar"><span class="bx-row" style="gap:8px">' + (ic ? icon(ic) : '') + label + '</span>' + icon('flat') + '</button>'; },
    iconBtn: function (ic, label) { return '<button class="bx-btn bx-btn-icon" aria-label="' + label + '" title="' + label + '">' + icon(ic) + '</button>'; },
    tick: function (el, v, dp) {
      var prev = parseFloat(el.getAttribute('data-v')); el.setAttribute('data-v', v); el.textContent = num(v, dp);
      if (isNaN(prev) || prev === v) return; el.classList.add('bx-tick'); el.classList.remove('bx-tick-up', 'bx-tick-down'); void el.offsetWidth; el.classList.add(v > prev ? 'bx-tick-up' : 'bx-tick-down');
    },
    bindSeg: function (seg) {
      if (seg.classList.contains('is-bound')) return;
      seg.classList.add('is-bound'); var ind = document.createElement('i'); ind.className = 'bx-seg-ind'; seg.insertBefore(ind, seg.firstChild);
      function place() { var a = seg.querySelector('.bx-seg-item.is-active'); if (a) { ind.style.left = a.offsetLeft + 'px'; ind.style.width = a.offsetWidth + 'px'; } }
      seg.addEventListener('click', function (e) { var b = e.target.closest('.bx-seg-item'); if (!b) return; seg.querySelectorAll('.bx-seg-item').forEach(function (x) { x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false'); }); b.classList.add('is-active'); b.setAttribute('aria-selected', 'true'); place(); });
      place(); if (document.fonts) document.fonts.ready.then(place);
    },
    status: function (state, text) { return '<span class="bx-status bx-status-' + state + '">' + icon('st-' + state, { size: 16 }) + text + '</span>'; },
    horizonTabs: function (sel, opts) {
      opts = opts || {};
      return '<div class="bx-seg" role="tablist" aria-label="Horizonte">' + horizons.map(function (h) { return '<button role="tab" class="bx-seg-item' + (h.id === sel ? ' is-active' : '') + '" aria-selected="' + (h.id === sel) + '">' + (opts.short ? h.short : h.label) + '</button>'; }).join('') + '</div>';
    },
    priceHeader: function (aid, hid) {
      var a = A(aid), p = predict(aid, hid || '1m');
      return '<div class="bx-ph">' +
        '<div class="bx-ph-id"><div class="bx-ph-name">' + a.name + '</div><div class="bx-ph-venue">' + a.venue + ' · ' + a.unit + '</div></div>' +
        '<div class="bx-ph-block"><div class="bx-label">Último</div><div class="bx-num-lg">' + num(a.last) + '</div>' + chg(a.chg, a.chg / (a.last - a.chg)) + '</div>' +
        '<div class="bx-ph-block bx-ph-fc"><div class="bx-label">Previsto · ' + p.horizon.label + '</div><div class="bx-num-lg bx-fc-text">' + num(p.mid) + '</div>' + chg(p.delta, p.deltaPct) + '</div>' +
        '<div class="bx-ph-block"><div class="bx-label">Intervalo 80 %</div><div class="bx-num">' + num(p.lo80) + ' – ' + num(p.hi80) + '</div><div class="bx-muted bx-num-sm">95 %: ' + num(p.lo95) + ' – ' + num(p.hi95) + '</div></div>' +
        '<div class="bx-ph-meta">' + ui.status('live', 'En directo · 14:30:12') + '<div class="bx-muted bx-body-sm">Modelo Ensemble GBM v3.2 · ejecutado 14:15</div></div>' +
        '</div>';
    },
    assetList: function (sel, hid) {
      return '<div class="bx-assets" role="listbox" aria-label="Activos">' + assets.map(function (a) {
        var p = predict(a.id, hid || '1w');
        return '<div role="option" aria-selected="' + (a.id === sel) + '" class="bx-asset' + (a.id === sel ? ' is-active' : '') + '">' +
          '<div class="bx-asset-id"><div class="bx-asset-name">' + a.name + '</div><div class="bx-muted bx-body-sm">' + a.venue + '</div></div>' +
          '<div data-bx="spark" data-asset="' + a.id + '" data-width="56" class="bx-asset-spark"></div>' +
          '<div class="bx-asset-px"><div class="bx-num">' + num(a.last) + '</div>' + chg(a.chg) + '</div>' +
          '<div class="bx-asset-dir bx-' + dir(p.delta) + '" title="Previsión 1 semana"><span aria-hidden="true">' + arrow(p.delta) + '</span>' + pct(p.pUp > 0.5 ? p.pUp : 1 - p.pUp) + '</div>' +
          '</div>';
      }).join('') + '</div>';
    },
    directionMeter: function (aid, hid, opts) {
      opts = opts || {};
      var p = predict(aid, hid), up = p.pUp, down = 1 - up, lead = up >= 0.5;
      return '<div class="bx-dm' + (opts.compact ? ' bx-dm-compact' : '') + '">' +
        (opts.compact ? '' : '<div class="bx-dm-head"><span class="bx-label">Dirección · ' + p.horizon.label + '</span><span class="bx-muted bx-body-sm">P(cierre &gt; ' + num(p.last) + ')</span></div>') +
        '<div class="bx-dm-big bx-' + (lead ? 'up' : 'down') + '">' + arrow(lead ? 1 : -1, 16) + (lead ? 'Sube' : 'Baja') + ' <b>' + pct(lead ? up : down) + '</b></div>' +
        '<div class="bx-dm-bar" role="img" aria-label="Sube ' + pct(up) + ', baja ' + pct(down) + '"><span class="bx-dm-up" style="width:' + (up * 100).toFixed(1) + '%"></span><span class="bx-dm-down" style="width:' + (down * 100).toFixed(1) + '%"></span><i class="bx-dm-mid"></i></div>' +
        '<div class="bx-dm-legend"><span class="bx-up-text">' + arrow(1, 10) + ' ' + pct(up) + '</span><span class="bx-down-text">' + arrow(-1, 10) + ' ' + pct(down) + '</span></div>' +
        '</div>';
    },
    forecastCard: function (aid, hid, opts) {
      opts = opts || {};
      var p = predict(aid, hid);
      return '<div class="bx-fcard' + (opts.active ? ' is-active' : '') + '">' +
        '<div class="bx-fcard-h"><span class="bx-label">' + p.horizon.label + '</span>' + ui.badge(arrow(p.pUp > 0.5 ? 1 : -1, 10) + pct(p.pUp > 0.5 ? p.pUp : 1 - p.pUp), p.pUp > 0.5 ? 'up' : 'down') + '</div>' +
        '<div class="bx-num-lg">' + num(p.mid) + '</div>' + chg(p.delta, p.deltaPct) +
        '<div data-bx="interval" data-asset="' + aid + '" data-horizon="' + hid + '" class="bx-fcard-ib"></div>' +
        '<div class="bx-fcard-range bx-num-sm bx-muted"><span>' + num(p.lo80) + '</span><span>80 %</span><span>' + num(p.hi80) + '</span></div>' +
        '</div>';
    },
    matrix: function (opts) {
      opts = opts || {};
      var hs = opts.horizons || ['1d', '1w', '1m', '3m'], as = opts.assets || assets.map(function (a) { return a.id; });
      var head = '<tr><th class="bx-th-asset">Activo</th><th class="bx-num-col">Último</th>' + hs.map(function (h) { return '<th colspan="2" class="bx-th-h">' + Hz(h).label + '</th>'; }).join('') + '</tr>';
      var rows = as.map(function (id) {
        var a = A(id);
        return '<tr><td><div class="bx-asset-name">' + a.name + '</div><div class="bx-muted bx-body-sm">' + a.venue + '</div></td><td class="bx-num-col bx-num">' + num(a.last) + '</td>' + hs.map(function (h) {
          var p = predict(id, h);
          return '<td class="bx-num-col"><div class="bx-num">' + num(p.mid) + '</div><div class="bx-chg-sm bx-' + dir(p.delta) + '-text">' + arrow(p.delta) + ' ' + pct(p.pUp > 0.5 ? p.pUp : 1 - p.pUp) + '</div></td><td class="bx-ib-col"><div data-bx="interval" data-asset="' + id + '" data-horizon="' + h + '" data-width="88"></div></td>';
        }).join('') + '</tr>';
      }).join('');
      return '<table class="bx-table bx-matrix"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
    },
    metrics: function (aid) {
      var b = backtest(aid || 'BRENT');
      function tile(label, value, note, state) { return '<div class="bx-metric"><div class="bx-label">' + label + '</div><div class="bx-num-lg">' + value + '</div><div class="bx-body-sm ' + (state ? 'bx-' + state + '-text' : 'bx-muted') + '">' + note + '</div></div>'; }
      return '<div class="bx-metrics">' +
        tile('Acierto direccional', pct(b.hitRate), 'Últimos 60 días · ref. 50 %', b.hitRate > 0.55 ? 'up' : null) +
        tile('MAE', num(b.mae) + ' $', 'Error absoluto medio') +
        tile('RMSE', num(b.rmse) + ' $', 'Penaliza errores grandes') +
        tile('Cobertura 80 %', pct(b.coverage), b.coverage < 0.75 ? 'Por debajo del objetivo (80 %)' : 'Objetivo 80 %', b.coverage < 0.75 ? 'warn' : null) +
        '</div>';
    },
    drivers: function (opts) {
      opts = opts || {};
      var list = drivers.slice(0, opts.limit || drivers.length), max = Math.max.apply(0, drivers.map(function (d) { return Math.abs(d.value); }));
      return '<div class="bx-drivers">' + list.map(function (d) {
        var w = Math.abs(d.value) / max * 50;
        return '<div class="bx-driver"><div class="bx-driver-name"><div>' + d.name + '</div>' + (opts.compact ? '' : '<div class="bx-muted bx-body-sm">' + d.detail + '</div>') + '</div>' +
          '<div class="bx-driver-bar" role="img" aria-label="' + d.name + ' ' + signed(d.value, 2) + ' dólares"><i class="bx-driver-axis"></i><span class="bx-driver-fill bx-fill-' + dir(d.value) + '" style="' + (d.value > 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%"></span></div>' +
          '<div class="bx-num bx-driver-val bx-' + dir(d.value) + '-text">' + signed(d.value, 2) + '</div></div>';
      }).join('') + '</div>';
    },
    modelLegend: function (ms) {
      return '<div class="bx-legend">' + (ms || [0, 1, 2, 3]).map(function (m) { var md = models[m], p = predict('BRENT', '1m', m); return '<div class="bx-legend-item"><i class="bx-key bx-s' + (m + 1) + '"></i><span>' + md.name + '</span>' + ui.badge(md.tag, m === 0 ? 'fc' : 'neutral') + '<span class="bx-num bx-legend-val">' + num(p.mid) + '</span></div>'; }).join('') + '<div class="bx-legend-item"><i class="bx-key bx-actual"></i><span>Real</span></div></div>';
    },
    alerts: function () {
      return '<div class="bx-alerts">' + alerts.map(function (al) {
        var fired = al.state === 'fired';
        return '<div class="bx-alert' + (fired ? ' is-fired' : '') + '">' + ui.status(fired ? 'fired' : 'armed', fired ? 'Disparada' : 'Activa') +
          '<div class="bx-alert-body"><div><b>' + A(al.asset).name + '</b> · ' + al.rule + '</div><div class="bx-muted bx-body-sm">' + al.when + '</div></div>' +
          '<div class="bx-num">' + al.value + '</div></div>';
      }).join('') + '</div>';
    }
  };

  function hydrate(root) {
    (root || document).querySelectorAll('.bx-seg').forEach(function (s) { ui.bindSeg(s); });
    (root || document).querySelectorAll('[data-bx]').forEach(function (n) {
      var t = n.getAttribute('data-bx'), o = { asset: n.getAttribute('data-asset') || undefined, horizon: n.getAttribute('data-horizon') || undefined };
      if (n.getAttribute('data-height')) o.height = +n.getAttribute('data-height');
      if (n.getAttribute('data-width')) o.width = +n.getAttribute('data-width');
      if (n.getAttribute('data-bands')) o.bands = n.getAttribute('data-bands');
      if (charts[t]) charts[t](n, o);
    });
  }

  window.Sonda = { data: { assets: assets, horizons: horizons, models: models, drivers: drivers, alerts: alerts, predict: predict, path: path, backtest: backtest, curve: curve }, fmt: { num: num, signed: signed, pct: pct }, charts: charts, ui: ui, hydrate: hydrate };
})();
