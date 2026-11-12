/* @ds-bundle: {"format":4,"namespace":"Sonda","components":[{"name":"ForecastChart"},{"name":"PriceHeader"},{"name":"ForecastPanel"},{"name":"HorizonTabs"},{"name":"ForecastCard"},{"name":"DirectionMeter"},{"name":"ModelPerformance"},{"name":"Drivers"},{"name":"ThemeToggle"},{"name":"Button"},{"name":"Badge"},{"name":"Icons"},{"name":"Logo"}]} */
/* Sonda 2 · sistema de diseño de la previsión del Brent. Sin dependencias.
   window.Sonda = { theme, fmt, data, fan, tradingDays, horizons, charts: { price, backtest }, ui: { … } } */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ── formato es-ES ─────────────────────────────── */
  var nfCache = {};
  function nf(dp) {
    if (!nfCache[dp]) nfCache[dp] = new Intl.NumberFormat('es-ES', { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: true });
    return nfCache[dp];
  }
  function num(v, dp) { if (v == null || isNaN(v)) return '—'; if (Math.abs(v) < 0.5 * Math.pow(10, -(dp == null ? 2 : dp))) v = 0; return nf(dp == null ? 2 : dp).format(v).replace('-', '−'); }
  function signed(v, dp, suf) { return (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), dp) + (suf || ''); }
  function pct(v, dp) { return num(v * 100, dp || 0) + ' %'; }
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function toDate(t) { return t instanceof Date ? t : new Date(t + 'T12:00:00Z'); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function day(t) { var d = toDate(t); return d.getUTCDate() + ' ' + MES[d.getUTCMonth()]; }
  function longDate(t) { var d = toDate(t); return d.getUTCDate() + ' ' + MES[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function monthYear(t) { var d = toDate(t); return MES[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2); }
  var fmt = { num: num, signed: signed, pct: pct, day: day, longDate: longDate, monthYear: monthYear };

  /* ── horizontes ────────────────────────────────── */
  var horizons = [
    { h: 5, label: '1 semana', short: '1S' },
    { h: 21, label: '1 mes', short: '1M' },
    { h: 63, label: '3 meses', short: '3M' },
    { h: 252, label: '1 año', short: '1A' }
  ];
  function hz(h) { for (var i = 0; i < horizons.length; i++) if (horizons[i].h === h) return horizons[i]; return { h: h, label: h + ' días', short: h + 'd' }; }

  /** n días hábiles (lunes a viernes) después de `from` (ISO), como ISO. */
  function tradingDays(from, n) {
    var out = [], d = toDate(from);
    while (out.length < n) { d = new Date(d.getTime() + 864e5); var w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(iso(d)); }
    return out;
  }

  /** Trayectoria diaria del abanico hasta H días a partir de las previsiones por horizonte.
   *  Central: interpolación en log-precio. Intervalo: varianza lineal en el tiempo entre nudos
   *  (el abanico se abre en curva, como √t). `computed` marca los días que calcula una red.
   *  Si `knots` trae un nudo por día, la trayectoria es exactamente esa. */
  function fan(last, knots, H, from) {
    var ks = [{ h: 0, lo: last, mid: last, hi: last }].concat(knots.filter(function (k) { return k.h <= H; }))
      .sort(function (a, b) { return a.h - b.h; });
    var dates = tradingDays(from, H), out = [];
    for (var d = 1; d <= H; d++) {
      var j = 1; while (ks[j].h < d) j++;
      var a = ks[j - 1], b = ks[j], w = (d - a.h) / (b.h - a.h);
      var mid = Math.exp(Math.log(a.mid) + w * (Math.log(b.mid) - Math.log(a.mid)));
      var ua = Math.log(a.hi / a.mid), ub = Math.log(b.hi / b.mid), da = Math.log(a.mid / a.lo), db = Math.log(b.mid / b.lo);
      var up = Math.sqrt(ua * ua + (ub * ub - ua * ua) * w), dn = Math.sqrt(da * da + (db * db - da * da) * w);
      out.push({ t: dates[d - 1], mid: mid, lo80: mid * Math.exp(-dn), hi80: mid * Math.exp(up), computed: d === b.h });
    }
    return out;
  }

  /* ── tema claro / oscuro ───────────────────────── */
  var THEME_KEY = 'sonda-theme';
  var theme = {
    get: function () { return document.documentElement.getAttribute('data-theme') || 'light'; },
    set: function (t, persist) {
      document.documentElement.setAttribute('data-theme', t);
      if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* sin almacenamiento */ } }
      var btns = document.querySelectorAll('[data-sonda-theme]');
      for (var i = 0; i < btns.length; i++) btns[i].innerHTML = themeIcon(t);
    },
    /** Arranca según la preferencia guardada o, si no hay, según el sistema; sigue los cambios del sistema. */
    init: function () {
      var saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
      var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      theme.set(saved || (mq && mq.matches ? 'dark' : 'light'));
      if (mq && mq.addEventListener) mq.addEventListener('change', function (e) {
        var s = null; try { s = localStorage.getItem(THEME_KEY); } catch (er) { s = null; }
        if (!s) theme.set(e.matches ? 'dark' : 'light');
      });
    },
    toggle: function () { theme.set(theme.get() === 'dark' ? 'light' : 'dark', true); },
    /** Engancha los botones [data-sonda-theme] dentro de root. */
    bind: function (root) {
      (root || document).addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-sonda-theme]'); if (b) theme.toggle();
      });
    }
  };

  /* ── iconos (16 px, trazo 1,5, currentColor) ───── */
  var IC = {
    'arrow-up': '<path d="M5 11 11 5M6 5h5v5"/>',
    'arrow-down': '<path d="M5 5l6 6M11 6v5H6"/>',
    'arrow-flat': '<path d="M3 8h10M10 5l3 3-3 3"/>',
    sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
    moon: '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"/>',
    cursor: '<path d="M8 2v4M8 10v4M2 8h4M10 8h4"/>',
    trend: '<path d="M2.5 13.5 13.5 2.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="13" cy="3" r="1.5"/>',
    level: '<path d="M1.5 8h13"/><circle cx="8" cy="8" r="1.5"/><path d="M3 4.5h3M10 11.5h3" opacity=".5"/>',
    measure: '<path d="M2.5 13.5 13.5 2.5M5 13.5h-2.5V11M11 2.5h2.5V5"/>',
    trash: '<path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9"/>',
    reset: '<path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5"/>',
    indicators: '<path d="M2 12.5 6 8l3 2.5 5-6"/><path d="M2 3.5h3" opacity=".5"/>',
    chevron: '<path d="M4.5 6.5 8 10l3.5-3.5"/>'
  };
  function icon(name, size) {
    var s = size || 16;
    return '<svg class="bx-icon" width="' + s + '" height="' + s + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[name] || '') + '</svg>';
  }
  function themeIcon(t) { return icon(t === 'dark' ? 'sun' : 'moon', 18); }
  function arrow(v, size) { return icon(v > 0 ? 'arrow-up' : v < 0 ? 'arrow-down' : 'arrow-flat', size || 14); }

  /* ── constructores HTML ────────────────────────── */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function chg(abs, rel) {
    var d = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
    return '<span class="bx-chg bx-' + d + '">' + arrow(abs, 14) + signed(abs) + ' (' + signed(rel * 100, 2, ' %') + ')</span>';
  }
  function logo(o) {
    var s = (o && o.size) || 24;
    return '<span class="bx-logo"><svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path class="bx-logo-band" d="M13 12 22 5v14Z"/>' +
      '<path class="bx-logo-real" d="M2 15l3-3 3 2 5-2" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="bx-logo-core" d="M13 12h9" fill="none" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 2.5"/>' +
      '<circle class="bx-logo-dot" cx="13" cy="12" r="2.2"/></svg>' + ((o && o.mark) ? '' : 'Sonda') + '</span>';
  }
  function themeToggle() {
    return '<button class="bx-iconbtn" type="button" data-sonda-theme aria-label="Cambiar entre tema claro y oscuro">' + themeIcon(theme.get()) + '</button>';
  }
  function badge(text, tone, block) {
    return '<span class="bx-badge' + (tone ? ' bx-badge-' + tone : '') + (block ? ' bx-badge-block' : '') + '">' + esc(text) + '</span>';
  }
  function pill(text, o) {
    o = o || {};
    return '<button type="button" class="bx-pill' + (o.small ? ' bx-pill-sm' : '') + (o.solid ? ' bx-pill-solid' : '') + (o.active ? ' is-active' : '') + '"' +
      (o.data ? ' ' + o.data : '') + (o.active != null ? ' aria-pressed="' + !!o.active + '"' : '') + '>' + (o.icon ? icon(o.icon) : '') + esc(text) + '</button>';
  }
  /** Píldoras de horizonte. `items`: [{h,label}] (por defecto los cuatro), `sel`: horizonte activo. */
  function horizonTabs(sel, items) {
    return '<div class="bx-pills" role="group" aria-label="Horizonte">' + (items || horizons).map(function (x) {
      return pill(x.label, { active: x.h === sel, data: 'data-h="' + x.h + '"' });
    }).join('') + '</div>';
  }
  /** Precio actual grande, y al lado el previsto y el intervalo del horizonte elegido. */
  function priceHeader(m, f) {
    var H = hz(f.h);
    return '<div class="bx-ph">' +
      '<div><div class="bx-ph-v">' + num(m.last) + ' $</div><div class="bx-ph-sub">' + chg(m.change, m.change / (m.last - m.change)) + '<span>' + day(m.ts) + '</span></div></div>' +
      '<div class="bx-ph-b bx-ph-fc"><div class="bx-ph-v2">' + num(f.mid) + ' $</div><div class="bx-ph-l">Previsto a ' + H.label + '</div></div>' +
      '<div class="bx-ph-b"><div class="bx-ph-v2">' + num(f.lo) + ' – ' + num(f.hi) + '</div><div class="bx-ph-l">Intervalo 80 %</div></div>' +
      '</div>';
  }
  /** P(precio final > último), con log-precio normal y el 80 % como ±1,2816 σ. */
  function probUp(last, f) {
    var s = (Math.log(f.hi) - Math.log(f.lo)) / (2 * 1.2816);
    if (!(s > 0)) return f.mid > last ? 1 : 0;
    var z = (Math.log(f.mid) - Math.log(last)) / s;
    var t = 1 / (1 + 0.2316419 * Math.abs(z)), dd = 0.3989423 * Math.exp(-z * z / 2);
    var p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  /** Barra de probabilidad de subida y bajada. Zona sin sesgo entre 45 % y 55 %. */
  function directionMeter(up) {
    var neutral = up >= 0.45 && up <= 0.55, lead = up >= 0.5;
    var head = neutral ? '<span>Sin sesgo claro</span>' :
      '<span class="bx-' + (lead ? 'up' : 'down') + '-text bx-row" style="gap:6px">' + arrow(lead ? 1 : -1, 16) + (lead ? 'Más probable que suba' : 'Más probable que baje') + '</span>';
    return '<div class="bx-sunken bx-dm">' +
      '<div class="bx-dm-h">' + head + '</div>' +
      '<div class="bx-dm-bar" role="img" aria-label="Sube ' + pct(up) + ', baja ' + pct(1 - up) + '"><span class="bx-dm-up" style="width:' + (up * 100).toFixed(1) + '%"></span><span class="bx-dm-down" style="width:' + ((1 - up) * 100).toFixed(1) + '%"></span></div>' +
      '<div class="bx-dm-l"><span class="bx-up-text">Sube ' + pct(up) + '</span><span class="bx-down-text">Baja ' + pct(1 - up) + '</span></div></div>';
  }
  /** Panel de previsión: cifra protagonista, fecha objetivo, dirección, filas clave y veredicto. */
  function forecastPanel(m, f) {
    var H = hz(f.h), target = tradingDays(m.ts, f.h)[f.h - 1], q = f.quality;
    var better = q && q.metrics.mae < q.baseline.mae;
    var rows = [['Precio actual', num(m.last) + ' $'], ['Intervalo 80 %', num(f.lo) + ' – ' + num(f.hi) + ' $']];
    if (q) {
      rows.push(['Acierto de dirección', pct(q.metrics.hit_rate) + '<span>regla fija ' + pct(q.baseline.hit_rate_best_constant) + '</span>']);
      rows.push(['Error medio', num(q.metrics.mae) + ' $<span>sin cambios ' + num(q.baseline.mae) + ' $</span>']);
      rows.push(['Cobertura del intervalo', pct(q.metrics.coverage80) + '<span>objetivo 80 %</span>']);
    }
    return '<div class="bx-card-t">Previsión · ' + H.label + '</div>' +
      '<div class="bx-fc-big"><span class="bx-fc-v">' + num(f.mid) + ' $</span>' + chg(f.mid - m.last, f.mid / m.last - 1) + '</div>' +
      '<div class="bx-fc-when">' + longDate(target) + (f.model ? ' · ' + esc(f.model) : '') + '</div>' +
      directionMeter(probUp(m.last, f)) +
      '<dl class="bx-kv" style="margin-top:6px">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>' +
      (q ? '<div style="margin-top:auto;padding-top:16px">' + badge(better ? 'Mejora a precio constante' : 'Orientativo · no mejora a precio constante', better ? 'up' : 'warn', true) + '</div>' : '');
  }
  /** Barra de intervalo: pista común a todas las tarjetas (min–max), banda 80 %, central y último precio. */
  function intervalBar(last, f, min, max) {
    var x = function (v) { return ((v - min) / (max - min) * 100).toFixed(2) + '%'; };
    return '<svg class="bx-ib" aria-hidden="true"><rect class="bx-ib-track" x="0" y="6" width="100%" height="6" rx="3"/>' +
      '<rect class="bx-ib-band" x="' + x(f.lo) + '" y="4" width="' + ((f.hi - f.lo) / (max - min) * 100).toFixed(2) + '%" height="10" rx="5"/>' +
      '<line class="bx-ib-last" x1="' + x(last) + '" x2="' + x(last) + '" y1="2" y2="16"/>' +
      '<rect class="bx-ib-mid" x="calc(' + x(f.mid) + ' - 2px)" y="2" width="4" height="14" rx="2"/></svg>';
  }
  /** Tarjetas de horizonte con la sigla grande de fondo. `fs`: previsiones, `sel`: horizonte activo. */
  function forecastCards(m, fs, sel) {
    var min = Math.min.apply(null, fs.map(function (f) { return f.lo; }).concat(m.last));
    var max = Math.max.apply(null, fs.map(function (f) { return f.hi; }).concat(m.last));
    var pad = (max - min) * 0.04; min -= pad; max += pad;
    return '<div class="bx-fcards">' + fs.map(function (f) {
      var H = hz(f.h);
      return '<button type="button" class="bx-fcard' + (f.h === sel ? ' is-active' : '') + '" data-h="' + f.h + '" aria-pressed="' + (f.h === sel) + '">' +
        '<span class="bx-fcard-big" aria-hidden="true">' + H.short + '</span>' +
        '<span class="bx-fcard-h">' + H.label + '</span>' +
        '<span class="bx-fcard-v">' + num(f.mid) + ' $</span>' + chg(f.mid - m.last, f.mid / m.last - 1) +
        intervalBar(m.last, f, min, max) +
        '<span class="bx-fcard-range"><span>' + num(f.lo) + '</span><span>' + num(f.hi) + '</span></span></button>';
    }).join('') + '</div>';
  }
  /** Cifras de fiabilidad en el periodo de test, cada una con su referencia trivial. */
  function metrics(q) {
    var m = q.metrics, b = q.baseline;
    var tile = function (l, v, r, worse) { return '<div class="bx-metric"><div class="bx-metric-l">' + l + '</div><div class="bx-metric-v">' + v + '</div><div class="bx-metric-r' + (worse ? ' is-worse' : '') + '">' + r + '</div></div>'; };
    return '<div class="bx-metrics">' +
      tile('Acierto de dirección', pct(m.hit_rate), 'Regla fija ' + pct(b.hit_rate_best_constant), m.hit_rate <= b.hit_rate_best_constant) +
      tile('Error medio', num(m.mae) + ' $', 'Sin cambios ' + num(b.mae) + ' $', m.mae >= b.mae) +
      tile('RMSE', num(m.rmse) + ' $', 'Sin cambios ' + num(b.rmse) + ' $', m.rmse >= b.rmse) +
      tile('Cobertura 80 %', pct(m.coverage80), 'Objetivo 80 %', m.coverage80 < 0.75) + '</div>';
  }
  /** Barras divergentes: cuánto cambia el previsto ($/bbl) sin cada variable. */
  function drivers(list, n) {
    var top = list.slice().sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); }).slice(0, n || 6)
      .sort(function (a, b) { return b.value - a.value; });
    var max = Math.max.apply(null, top.map(function (d) { return Math.abs(d.value); })) || 1;
    return '<div class="bx-drivers">' + top.map(function (d) {
      var w = (Math.abs(d.value) / max * 50).toFixed(1), dir = d.value >= 0 ? 'up' : 'down';
      return '<div class="bx-driver"><div class="bx-driver-n">' + esc(d.name) + '</div>' +
        '<div class="bx-driver-bar" role="img" aria-label="' + esc(d.name) + ' ' + signed(d.value) + ' dólares"><i class="bx-driver-axis"></i><span class="bx-driver-fill bx-' + dir + '" style="' + (dir === 'up' ? 'left' : 'right') + ':50%;width:' + w + '%"></span></div>' +
        '<div class="bx-driver-v bx-' + dir + '-text">' + signed(d.value) + '</div></div>';
    }).join('') + '</div>';
  }

  /* ── utilidades de series ──────────────────────── */
  function sma(a, n) {
    var out = new Array(a.length), s = 0, c = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != null) { s += a[i]; c++; }
      if (i >= n && a[i - n] != null) { s -= a[i - n]; c--; }
      out[i] = i >= n - 1 && c === n ? s / n : null;
    }
    return out;
  }
  /** Banda de volatilidad: media de 21 días ± 2 desviaciones típicas de 21 días. */
  function volBand(a, n) {
    var lo = new Array(a.length), hi = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      if (i < n - 1 || a[i] == null) { lo[i] = hi[i] = null; continue; }
      var s = 0, s2 = 0, ok = true;
      for (var k = i - n + 1; k <= i; k++) { if (a[k] == null) { ok = false; break; } s += a[k]; s2 += a[k] * a[k]; }
      if (!ok) { lo[i] = hi[i] = null; continue; }
      var mu = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mu * mu));
      lo[i] = mu - 2 * sd; hi[i] = mu + 2 * sd;
    }
    return { lo: lo, hi: hi };
  }
  function niceStep(span, target) {
    var raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function el(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* ── gráfico interactivo del precio ────────────── */
  var RANGES = [['1M', 21], ['3M', 63], ['6M', 126], ['1A', 252], ['5A', 1260], ['Todo', Infinity]];
  var INDICATORS = [['ma20', 'Media 20 días'], ['ma50', 'Media 50 días'], ['vol', 'Banda de volatilidad'], ['wti', 'WTI']];
  var TOOLS = [['cursor', 'Cursor: arrastra para moverte, rueda para zoom'], ['trend', 'Línea de tendencia: dos clics'], ['level', 'Nivel horizontal: un clic'], ['measure', 'Medir: arrastra entre dos puntos']];

  /**
   * Monta el gráfico en `host` y devuelve un controlador.
   * o.history  {t:[ISO], close:[n]}   cierre diario real
   * o.forecast {path:[{t,mid,lo80,hi80,computed}]}  trayectoria (Sonda.fan la construye)
   * o.wti      {t:[ISO], close:[n]}   opcional, indicador WTI
   * o.events   [{t,price,label,kind:'max'|'min'}]   sucesos; se ven en rangos de 1 año o más
   * o.range '3M' · o.scale 'lin'|'log'|'pct' · o.indicators {ma20,ma50,vol,wti} · o.height 420
   */
  function priceChart(host, o) {
    o = o || {};
    var st = {
      range: o.range || '3M', scale: o.scale || 'lin', tool: 'cursor',
      ind: Object.assign({ ma20: false, ma50: false, vol: false, wti: false }, o.indicators || {}),
      drawings: [], pending: null, hover: null, a: 0, b: 0
    };
    var height = o.height || 420, R = 66, B = 26, T = 10;
    var hist = o.history, path = (o.forecast && o.forecast.path) || [];
    var nh = hist.t.length, N = nh + path.length, iNow = nh - 1;
    var T_ = hist.t.concat(path.map(function (p) { return p.t; }));
    var close = hist.close.concat(path.map(function () { return null; }));
    var ma20 = sma(close, 20), ma50 = sma(close, 50), vb = volBand(close, 21);
    var wti = new Array(N).fill(null);
    if (o.wti) { var map = {}; o.wti.t.forEach(function (t, k) { map[t] = o.wti.close[k]; }); for (var i = 0; i < nh; i++) if (map[T_[i]] != null) wti[i] = map[T_[i]]; }
    var evIdx = (o.events || []).map(function (e) { return { e: e, i: T_.indexOf(e.t) }; }).filter(function (x) { return x.i >= 0; });
    var hasWti = wti.some(function (v) { return v != null; });
    var allComputed = path.length > 0 && path.every(function (p) { return p.computed; });

    host.innerHTML =
      '<div class="bx-chart bx-root">' +
        '<div class="bx-chart-tools" role="toolbar" aria-label="Herramientas del gráfico">' +
          TOOLS.map(function (t) { return '<button type="button" class="bx-tool" data-tool="' + t[0] + '" title="' + t[1] + '" aria-label="' + t[1] + '">' + icon(t[0], 18) + '</button>'; }).join('') +
          '<i class="bx-tool-sep"></i>' +
          '<button type="button" class="bx-tool" data-act="clear" title="Borrar dibujos" aria-label="Borrar dibujos">' + icon('trash', 18) + '</button>' +
          '<button type="button" class="bx-tool" data-act="reset" title="Volver al rango" aria-label="Volver al rango">' + icon('reset', 18) + '</button>' +
        '</div>' +
        '<div class="bx-chart-main">' +
          '<div class="bx-chart-top"><div class="bx-readout" aria-live="polite"></div><div class="bx-spacer"></div>' +
            '<div class="bx-menu-wrap"><button type="button" class="bx-pill bx-pill-sm bx-pill-solid" data-act="menu" aria-expanded="false">' + icon('indicators') + 'Indicadores' + icon('chevron', 14) + '</button>' +
            '<div class="bx-menu" role="menu">' + INDICATORS.filter(function (x) { return x[0] !== 'wti' || hasWti; }).map(function (x) {
              return '<label><input type="checkbox" data-ind="' + x[0] + '"' + (st.ind[x[0]] ? ' checked' : '') + '><i class="bx-key bx-key-' + x[0] + '"></i>' + x[1] + '</label>';
            }).join('') + '</div></div>' +
          '</div>' +
          '<div class="bx-chart-plot" tabindex="0" aria-label="Gráfico del precio. Flechas para moverte, más y menos para zoom."></div>' +
          '<div class="bx-chart-bottom"><div class="bx-pills" data-g="range">' + RANGES.map(function (r) { return pill(r[0], { small: true, data: 'data-range="' + r[0] + '"' }); }).join('') + '</div>' +
            '<div class="bx-spacer"></div><div class="bx-pills" data-g="scale">' + [['lin', 'Lineal'], ['log', 'Log'], ['pct', '%']].map(function (s) { return pill(s[1], { small: true, data: 'data-scale="' + s[0] + '"' }); }).join('') + '</div></div>' +
        '</div>' +
      '</div>';
    var $ = function (s) { return host.querySelector(s); };
    var plot = $('.bx-chart-plot'), readout = $('.bx-readout'), menu = $('.bx-menu'), menuBtn = $('[data-act="menu"]');
    var svg = el('svg', { role: 'img', 'aria-label': 'Precio del Brent y previsión' }); plot.appendChild(svg);
    var W = 600;

    function setRange(r) {
      st.range = r;
      var span = 63; RANGES.forEach(function (x) { if (x[0] === r) span = x[1]; });
      st.a = span === Infinity ? 0 : Math.max(0, iNow - span);
      st.b = N - 1 + Math.max(2, (N - 1 - st.a) * 0.02);
      sync();
    }
    function step() { var s = st.b - st.a; return s <= 520 ? 1 : s <= 2600 ? 5 : 21; }
    function visIdx() {
      var s = step(), out = [], lo = Math.max(0, Math.floor(st.a)), hi = Math.min(N - 1, Math.ceil(st.b));
      for (var i = lo; i <= hi; i++) if (i > iNow || (iNow - i) % s === 0) out.push(i);
      return out;
    }
    function base() { var lo = Math.max(0, Math.ceil(st.a)); for (var i = lo; i <= iNow; i++) if (close[i] != null) return close[i]; return close[iNow]; }
    function tf(v) { // transforma valor a la escala elegida
      if (v == null) return null;
      if (st.scale === 'log') return Math.log(v);
      if (st.scale === 'pct') return (v / base() - 1) * 100;
      return v;
    }
    function inv(y) { if (st.scale === 'log') return Math.exp(y); if (st.scale === 'pct') return base() * (1 + y / 100); return y; }
    var X, Y, y0, y1, levelTags = [];
    function domain(ids) {
      var lo = Infinity, hi = -Infinity;
      function take(v) { if (v == null) return; var t = tf(v); if (t < lo) lo = t; if (t > hi) hi = t; }
      ids.forEach(function (i) {
        take(close[i]);
        if (st.ind.ma20) take(ma20[i]); if (st.ind.ma50) take(ma50[i]);
        if (st.ind.vol) { take(vb.lo[i]); take(vb.hi[i]); }
        if (st.ind.wti) take(wti[i]);
        if (i > iNow) { var p = path[i - nh]; take(p.lo80); take(p.hi80); }
      });
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      var pad = (hi - lo) * 0.08 || 1; y0 = lo - pad; y1 = hi + pad;
      var ph = height - B - T;
      X = function (i) { return (i - st.a) / (st.b - st.a) * (W - R); };
      Y = function (v) { return T + (1 - (tf(v) - y0) / (y1 - y0)) * ph; };
    }
    function line(ids, arr, cls) {
      var d = '', pen = false;
      ids.forEach(function (i) { var v = arr[i]; if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
      return d ? el('path', { d: d, class: cls }) : null;
    }
    function area(ids, lo, hi, cls) {
      var pts = ids.filter(function (i) { return lo[i] != null && hi[i] != null; });
      if (pts.length < 2) return null;
      var d = pts.map(function (i, k) { return (k ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(hi[i]).toFixed(1); }).join('') +
        pts.slice().reverse().map(function (i) { return 'L' + X(i).toFixed(1) + ' ' + Y(lo[i]).toFixed(1); }).join('') + 'Z';
      return el('path', { d: d, class: cls });
    }
    function tag(y, text, cls) {
      var g = el('g', { class: 'bx-tag ' + (cls || '') }), w = R - 6;
      g.appendChild(el('rect', { x: W - R + 4, y: y - 10, width: w, height: 20, rx: 6 }));
      var t = el('text', { x: W - R + 4 + w / 2, y: y + 4, 'text-anchor': 'middle' }); t.textContent = text; g.appendChild(t);
      return g;
    }
    function yLabel(v) { return st.scale === 'pct' ? signed(v, 1, ' %') : num(inv(v), inv(v) >= 1000 ? 0 : 2); }

    function render() {
      W = plot.clientWidth || 600;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + height); svg.setAttribute('height', height);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var ids = visIdx(); domain(ids);
      var ph = height - B - T, plotW = W - R;
      var defs = el('defs', {}); var cp = el('clipPath', { id: clipId }); cp.appendChild(el('rect', { x: 0, y: 0, width: plotW, height: height })); defs.appendChild(cp); svg.appendChild(defs);
      // rejilla y eje Y
      var grid = el('g', { class: 'bx-grid' }), ax = el('g', { class: 'bx-axis' });
      var ys = niceStep(y1 - y0, Math.max(3, Math.round(ph / 64)));
      var tagYs = [];
      if (X(iNow) <= plotW) tagYs.push(Y(close[iNow]));
      if (path.length && X(N - 1) <= plotW + 1) tagYs.push(Y(path[path.length - 1].mid));
      st.drawings.forEach(function (d) { if (d.type === 'level') tagYs.push(Y(d.v)); });
      for (var v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) {
        var yy = T + (1 - (v - y0) / (y1 - y0)) * ph;
        grid.appendChild(el('line', { x1: 0, x2: plotW, y1: yy, y2: yy }));
        if (tagYs.some(function (ty) { return Math.abs(ty - yy) < 16; })) continue;
        var tx = el('text', { x: W - 4, y: yy + 4, 'text-anchor': 'end' }); tx.textContent = yLabel(v); ax.appendChild(tx);
      }
      // eje X
      var span = st.b - st.a, nT = Math.max(2, Math.floor(plotW / 110)), xs = Math.max(1, Math.round(span / nT));
      var useMonth = span > 200, useYear = span > 1400;
      var lastLbl = '';
      for (var i = Math.ceil(st.a / xs) * xs; i <= st.b; i += xs) {
        if (i < 0 || i >= N) continue;
        var lbl = useYear ? T_[i].slice(0, 4) : useMonth ? monthYear(T_[i]) : day(T_[i]);
        if (lbl === lastLbl) continue; lastLbl = lbl;
        var t2 = el('text', { x: X(i), y: height - 6, 'text-anchor': 'middle' }); t2.textContent = lbl; ax.appendChild(t2);
      }
      svg.appendChild(grid);
      var g = el('g', { 'clip-path': 'url(#' + clipId + ')' }); svg.appendChild(g);
      // zona futura y línea «Hoy»
      if (X(iNow) < plotW) {
        g.appendChild(el('rect', { class: 'bx-zone', x: X(iNow), y: T, width: Math.max(0, plotW - X(iNow)), height: ph }));
        g.appendChild(el('line', { class: 'bx-now', x1: X(iNow), x2: X(iNow), y1: T, y2: T + ph }));
        var nl = el('text', { class: 'bx-now-l', x: X(iNow) + 6, y: T + 14 }); nl.textContent = 'Hoy'; g.appendChild(nl);
      }
      // indicadores
      if (st.ind.vol) { var va = area(ids, vb.lo, vb.hi, 'bx-vol'); if (va) g.appendChild(va); }
      if (st.ind.wti) { var lw = line(ids, wti, 'bx-l-wti'); if (lw) g.appendChild(lw); }
      if (st.ind.ma50) { var l50 = line(ids, ma50, 'bx-l-ma50'); if (l50) g.appendChild(l50); }
      if (st.ind.ma20) { var l20 = line(ids, ma20, 'bx-l-ma20'); if (l20) g.appendChild(l20); }
      // previsión
      if (path.length) {
        var fi = [iNow].concat(path.map(function (_, k) { return nh + k; }));
        var lo = [], hi = [], mid = [];
        fi.forEach(function (i) { if (i === iNow) { lo[i] = hi[i] = mid[i] = close[iNow]; } else { var p = path[i - nh]; lo[i] = p.lo80; hi[i] = p.hi80; mid[i] = p.mid; } });
        var bnd = area(fi, lo, hi, 'bx-band'); if (bnd) g.appendChild(bnd);
        var ml = line(fi, mid, allComputed ? 'bx-l-fc' : 'bx-l-fc-est'); if (ml) g.appendChild(ml);
        path.forEach(function (p, k) { if (p.computed) g.appendChild(el('circle', { class: 'bx-dot-fc', cx: X(nh + k), cy: Y(p.mid), r: 4.5 })); });
      }
      // precio real
      var la = line(ids, close, 'bx-l-actual'); if (la) g.appendChild(la);
      // sucesos (rangos largos)
      if (span >= 240) evIdx.forEach(function (x) { if (x.i >= st.a && x.i <= st.b) g.appendChild(el('circle', { class: 'bx-ev bx-' + (x.e.kind === 'max' ? 'up' : 'down'), cx: X(x.i), cy: Y(x.e.price), r: 5 })); });
      // dibujos
      levelTags = [];
      st.drawings.concat(st.pending ? [st.pending] : []).forEach(function (d) { drawShape(g, d); });
      svg.appendChild(ax);
      levelTags.forEach(function (v) { svg.appendChild(tag(Y(v), num(v), 'bx-tag-x')); });
      // etiquetas de precio
      if (X(iNow) <= plotW) svg.appendChild(tag(Y(close[iNow]), num(close[iNow]), ''));
      if (path.length && X(N - 1) <= plotW + 1) svg.appendChild(tag(Y(path[path.length - 1].mid), num(path[path.length - 1].mid), 'bx-tag-fc'));
      // cruz
      if (st.hover) {
        var hi_ = st.hover.i, hx = X(hi_);
        g.appendChild(el('line', { class: 'bx-x', x1: hx, x2: hx, y1: T, y2: T + ph }));
        g.appendChild(el('line', { class: 'bx-x', x1: 0, x2: plotW, y1: st.hover.y, y2: st.hover.y }));
        var hv = hi_ <= iNow ? close[hi_] : path[hi_ - nh].mid;
        if (hv != null) g.appendChild(el('circle', { class: 'bx-x-dot', cx: hx, cy: Y(hv), r: 4 }));
        var yv = y0 + (1 - (st.hover.y - T) / ph) * (y1 - y0);
        svg.appendChild(tag(st.hover.y, yLabel(yv), 'bx-tag-x'));
      }
      renderReadout();
    }
    function drawShape(g, d) {
      if (d.type === 'level') {
        g.appendChild(el('line', { class: 'bx-draw-h', x1: 0, x2: W - R, y1: Y(d.v), y2: Y(d.v) }));
        levelTags.push(d.v);
      } else if (d.type === 'trend' && d.p2) {
        g.appendChild(el('line', { class: 'bx-draw', x1: X(d.p1.i), y1: Y(d.p1.v), x2: X(d.p2.i), y2: Y(d.p2.v) }));
        [d.p1, d.p2].forEach(function (p) { g.appendChild(el('circle', { class: 'bx-draw-pt', cx: X(p.i), cy: Y(p.v), r: 3.5 })); });
      } else if (d.type === 'measure' && d.p2) {
        var x1 = X(d.p1.i), x2 = X(d.p2.i), y1_ = Y(d.p1.v), y2_ = Y(d.p2.v);
        g.appendChild(el('rect', { class: 'bx-measure', x: Math.min(x1, x2), y: Math.min(y1_, y2_), width: Math.abs(x2 - x1), height: Math.abs(y2_ - y1_) }));
        var dv = d.p2.v - d.p1.v, dp = dv / d.p1.v, dd = Math.round(d.p2.i - d.p1.i);
        var txt = signed(dv) + ' $ · ' + signed(dp * 100, 2, ' %') + ' · ' + Math.abs(dd) + ' días';
        var lg = el('g', { class: 'bx-measure-l' }), tw = txt.length * 6.6 + 16, lx = Math.min(Math.max(4, (x1 + x2) / 2 - tw / 2), W - R - tw - 4), ly = Math.min(y1_, y2_) - 30;
        if (ly < T) ly = Math.max(y1_, y2_) + 6;
        lg.appendChild(el('rect', { x: lx, y: ly, width: tw, height: 24, rx: 8 }));
        var lt = el('text', { x: lx + tw / 2, y: ly + 16, 'text-anchor': 'middle' }); lt.textContent = txt; lg.appendChild(lt);
        g.appendChild(lg);
      }
    }
    function renderReadout() {
      var i = st.hover ? st.hover.i : iNow, parts = [];
      parts.push('<span class="bx-ro-date">' + longDate(T_[i]) + '</span>');
      if (i <= iNow) {
        parts.push('<span><i class="bx-key bx-key-actual"></i>Real <b>' + num(close[i]) + '</b></span>');
        if (i === iNow && path.length) { var pf = path[path.length - 1]; parts.push('<span><i class="bx-key bx-key-fc"></i>Previsto ' + day(pf.t) + ' <b>' + num(pf.mid) + '</b></span>'); }
      } else {
        var p = path[i - nh];
        parts.push('<span><i class="bx-key bx-key-fc"></i>' + (p.computed ? 'Previsto' : 'Estimado') + ' <b>' + num(p.mid) + '</b></span>');
        parts.push('<span><i class="bx-key bx-key-band"></i>80 % <b>' + num(p.lo80) + ' – ' + num(p.hi80) + '</b></span>');
      }
      if (st.ind.ma20 && ma20[i] != null) parts.push('<span><i class="bx-key bx-key-ma20"></i>M20 <b>' + num(ma20[i]) + '</b></span>');
      if (st.ind.ma50 && ma50[i] != null) parts.push('<span><i class="bx-key bx-key-ma50"></i>M50 <b>' + num(ma50[i]) + '</b></span>');
      if (st.ind.vol && vb.lo[i] != null) parts.push('<span><i class="bx-key bx-key-vol"></i>Banda <b>' + num(vb.lo[i]) + ' – ' + num(vb.hi[i]) + '</b></span>');
      if (st.ind.wti && wti[i] != null) parts.push('<span><i class="bx-key bx-key-wti"></i>WTI <b>' + num(wti[i]) + '</b></span>');
      var near = null, tol = Math.max(3, step() * 2); evIdx.forEach(function (x) { if (Math.abs(x.i - i) <= tol) near = x; });
      if (near && st.b - st.a >= 240) parts.push('<span><i class="bx-key bx-key-ev"></i><b>' + esc(near.e.label) + '</b></span>');
      readout.innerHTML = parts.join('');
    }
    function sync() {
      host.querySelectorAll('[data-range]').forEach(function (b) { var on = b.getAttribute('data-range') === st.range; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      host.querySelectorAll('[data-scale]').forEach(function (b) { var on = b.getAttribute('data-scale') === st.scale; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      host.querySelectorAll('[data-tool]').forEach(function (b) { var on = b.getAttribute('data-tool') === st.tool; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
      schedule();
      if (o.onChange) o.onChange({ range: st.range, scale: st.scale, indicators: Object.assign({}, st.ind) });
    }
    var raf = 0; function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); }
    var clipId = 'bxclip' + Math.random().toString(36).slice(2, 8);

    // posición del puntero → índice y valor
    function at(e) {
      var r = plot.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      var i = st.a + x / (W - R) * (st.b - st.a), ph = height - B - T;
      var v = inv(y0 + (1 - (y - T) / ph) * (y1 - y0));
      return { x: x, y: Math.max(T, Math.min(T + ph, y)), i: i, v: v };
    }
    function snap(i) {
      var ids = visIdx(), best = ids[0], bd = Infinity;
      ids.forEach(function (k) { var d = Math.abs(k - i); if (d < bd) { bd = d; best = k; } });
      return best;
    }
    function zoom(f, center) {
      var span = (st.b - st.a) * f; span = Math.max(12, Math.min(N + 40, span));
      var c = center == null ? (st.a + st.b) / 2 : center, w = (c - st.a) / (st.b - st.a);
      st.a = c - span * w; st.b = st.a + span; clamp(); st.range = ''; sync();
    }
    function pan(di) { st.a += di; st.b += di; clamp(); st.range = ''; sync(); }
    function clamp() {
      var span = st.b - st.a, minA = -span * 0.05, maxB = N - 1 + span * 0.1;
      if (st.a < minA) { st.a = minA; st.b = minA + span; }
      if (st.b > maxB) { st.b = maxB; st.a = maxB - span; }
    }

    var pointers = {}, drag = null, pinch = null;
    plot.addEventListener('pointerdown', function (e) {
      plot.setPointerCapture(e.pointerId); pointers[e.pointerId] = e;
      var ids = Object.keys(pointers);
      if (ids.length === 2) { var p1 = pointers[ids[0]], p2 = pointers[ids[1]]; pinch = { d: Math.abs(p1.clientX - p2.clientX) || 1, a: st.a, b: st.b }; drag = null; return; }
      var p = at(e);
      if (st.tool === 'cursor') { drag = { x: e.clientX, a: st.a, b: st.b }; plot.classList.add('is-pan'); }
      else if (st.tool === 'level') { st.drawings.push({ type: 'level', v: p.v }); schedule(); }
      else if (st.tool === 'trend') {
        if (!st.pending) st.pending = { type: 'trend', p1: { i: p.i, v: p.v }, p2: { i: p.i, v: p.v } };
        else { st.pending.p2 = { i: p.i, v: p.v }; st.drawings.push(st.pending); st.pending = null; }
        schedule();
      } else if (st.tool === 'measure') { st.pending = { type: 'measure', p1: { i: p.i, v: p.v }, p2: { i: p.i, v: p.v } }; schedule(); }
    });
    plot.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = e;
      if (pinch) {
        var ids = Object.keys(pointers); if (ids.length < 2) return;
        var d = Math.abs(pointers[ids[0]].clientX - pointers[ids[1]].clientX) || 1, f = pinch.d / d;
        var c = (pinch.a + pinch.b) / 2, span = Math.max(12, Math.min(N + 40, (pinch.b - pinch.a) * f));
        st.a = c - span / 2; st.b = c + span / 2; clamp(); st.range = ''; sync(); return;
      }
      var p = at(e);
      if (drag) { var dx = (e.clientX - drag.x) / (W - R) * (drag.b - drag.a); st.a = drag.a - dx; st.b = drag.b - dx; clamp(); st.range = ''; st.hover = null; sync(); return; }
      if (st.pending) { st.pending.p2 = { i: p.i, v: p.v }; }
      var i = snap(p.i); st.hover = i == null ? null : { i: i, y: p.y }; schedule();
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (drag) { drag = null; plot.classList.remove('is-pan'); }
      if (st.pending && st.pending.type === 'measure') { var p = at(e); st.pending.p2 = { i: p.i, v: p.v }; st.drawings.push(st.pending); st.pending = null; schedule(); }
    }
    plot.addEventListener('pointerup', up); plot.addEventListener('pointercancel', up);
    plot.addEventListener('pointerleave', function () { if (!drag) { st.hover = null; schedule(); } });
    plot.addEventListener('wheel', function (e) { e.preventDefault(); var p = at(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.i); }, { passive: false });
    plot.addEventListener('dblclick', function () { setRange(st.range || '3M'); });
    plot.addEventListener('keydown', function (e) {
      var span = st.b - st.a;
      if (e.key === 'ArrowLeft') { pan(-span * 0.1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { pan(span * 0.1); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { zoom(1 / 1.25); e.preventDefault(); }
      else if (e.key === '-') { zoom(1.25); e.preventDefault(); }
      else if (e.key === 'Escape') { st.pending = null; st.tool = 'cursor'; sync(); }
    });
    host.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t || !host.contains(t)) return;
      if (t.hasAttribute('data-range')) setRange(t.getAttribute('data-range'));
      else if (t.hasAttribute('data-scale')) { st.scale = t.getAttribute('data-scale'); sync(); }
      else if (t.hasAttribute('data-tool')) { st.tool = t.getAttribute('data-tool'); st.pending = null; sync(); }
      else if (t.getAttribute('data-act') === 'clear') { st.drawings = []; st.pending = null; schedule(); }
      else if (t.getAttribute('data-act') === 'reset') setRange(st.range || '3M');
      else if (t.getAttribute('data-act') === 'menu') { var open = !menu.classList.contains('is-open'); menu.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', open); }
    });
    menu.addEventListener('change', function (e) { var k = e.target.getAttribute('data-ind'); if (k) { st.ind[k] = e.target.checked; sync(); } });
    document.addEventListener('click', function (e) { if (!host.contains(e.target) || !e.target.closest('.bx-menu-wrap')) { menu.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); } });
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(plot);

    setRange(st.range);
    return {
      setRange: setRange,
      setScale: function (s) { st.scale = s; sync(); },
      setIndicator: function (k, on) { st.ind[k] = !!on; var cb = host.querySelector('[data-ind="' + k + '"]'); if (cb) cb.checked = !!on; sync(); },
      setTool: function (t) { st.tool = t; st.pending = null; sync(); },
      clearDrawings: function () { st.drawings = []; schedule(); },
      state: function () { return { range: st.range, scale: st.scale, indicators: Object.assign({}, st.ind), view: [st.a, st.b], drawings: st.drawings.slice() }; }
    };
  }

  /* ── backtest: real frente a previsto en el test ── */
  function backtestChart(host, o) {
    var pts = o.points, n = pts.length, h = o.height || 200, R = 52, B = 22, T = 8;
    host.innerHTML = '<div class="bx-root"><div class="bx-readout" style="min-height:20px;margin-bottom:6px"></div><div class="bx-chart-plot" style="cursor:crosshair"></div></div>';
    var plot = host.querySelector('.bx-chart-plot'), ro = host.querySelector('.bx-readout');
    var svg = el('svg', { class: 'bx-mini', role: 'img', 'aria-label': 'Backtest: real frente a previsto' }); plot.appendChild(svg);
    var lo = Infinity, hi = -Infinity; pts.forEach(function (p) { lo = Math.min(lo, p.lo80, p.actual); hi = Math.max(hi, p.hi80, p.actual); });
    var pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    var hover = null;
    function show(i) {
      var p = pts[i == null ? n - 1 : i], out = p.actual < p.lo80 || p.actual > p.hi80;
      ro.innerHTML = '<span class="bx-ro-date">' + longDate(p.t) + '</span><span><i class="bx-key bx-key-actual"></i>Real <b>' + num(p.actual) + '</b></span><span><i class="bx-key bx-key-fc"></i>Previsto <b>' + num(p.pred) + '</b></span>' + (out ? '<span class="bx-down-text">Fuera del 80 %</span>' : '');
    }
    function render() {
      var W = plot.clientWidth || 500, pw = W - R, ph = h - B - T;
      var X = function (i) { return i / (n - 1) * pw; }, Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * ph; };
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + h); svg.setAttribute('height', h);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var grid = el('g', { class: 'bx-grid' }), ax = el('g', { class: 'bx-axis' }), ys = niceStep(hi - lo, 4);
      for (var v = Math.ceil(lo / ys) * ys; v <= hi; v += ys) {
        grid.appendChild(el('line', { x1: 0, x2: pw, y1: Y(v), y2: Y(v) }));
        var t = el('text', { x: W - 4, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = num(v, 0); ax.appendChild(t);
      }
      var nt = Math.max(2, Math.floor(pw / 90)), last = '';
      for (var k = 0; k <= nt; k++) { var i = Math.round(k / nt * (n - 1)), l = monthYear(pts[i].t); if (l === last) continue; last = l; var tx = el('text', { x: X(i), y: h - 5, 'text-anchor': k === 0 ? 'start' : k === nt ? 'end' : 'middle' }); tx.textContent = l; ax.appendChild(tx); }
      svg.appendChild(grid);
      var band = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.hi80).toFixed(1); }).join('') + pts.slice().reverse().map(function (p, j) { return 'L' + X(n - 1 - j).toFixed(1) + ' ' + Y(p.lo80).toFixed(1); }).join('') + 'Z';
      svg.appendChild(el('path', { d: band, class: 'bx-band' }));
      svg.appendChild(el('path', { d: pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.pred).toFixed(1); }).join(''), class: 'bx-l-fc', style: 'stroke-dasharray:none;stroke-width:1.25' }));
      svg.appendChild(el('path', { d: pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.actual).toFixed(1); }).join(''), class: 'bx-l-actual', style: 'stroke-width:1.25' }));
      if (hover != null) { svg.appendChild(el('line', { class: 'bx-x', x1: X(hover), x2: X(hover), y1: T, y2: T + ph })); svg.appendChild(el('circle', { class: 'bx-x-dot', cx: X(hover), cy: Y(pts[hover].actual), r: 3.5 })); }
      svg.appendChild(ax); show(hover);
    }
    plot.addEventListener('pointermove', function (e) { var r = plot.getBoundingClientRect(), W = plot.clientWidth - R; hover = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left) / W * (n - 1)))); render(); });
    plot.addEventListener('pointerleave', function () { hover = null; render(); });
    if (window.ResizeObserver) new ResizeObserver(render).observe(plot);
    render();
  }

  /* ── datos de ejemplo (reales, exportados el 3 nov 2026) ── */
  /* Datos de ejemplo del artefacto eliminados: la web usa los de make export-web. */
  var DATA = { forecasts: [] };
  DATA.forecasts.forEach(function (f) {
    f.quality.backtest = f.quality.backtest.map(function (r) { return { t: r[0], actual: r[1], pred: r[2], lo80: r[3], hi80: r[4] }; });
  });

  window.Sonda = {
    version: '2.0.0',
    theme: theme, fmt: fmt, horizons: horizons, tradingDays: tradingDays, fan: fan, probUp: probUp,
    data: { brent: DATA },
    charts: { price: priceChart, backtest: backtestChart },
    ui: {
      icon: icon, arrow: arrow, chg: chg, logo: logo, themeToggle: themeToggle, badge: badge, pill: pill,
      horizonTabs: horizonTabs, priceHeader: priceHeader, forecastPanel: forecastPanel, directionMeter: directionMeter,
      forecastCards: forecastCards, intervalBar: intervalBar, metrics: metrics, drivers: drivers
    }
  };
})();
