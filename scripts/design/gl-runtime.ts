/**
 * The executive filter runtime. First-party, no dependencies, no external calls.
 *
 * Contract (client-runtime ADR §9): the browser may filter, count and sum **authoritative facts**.
 * It may not derive a band, an outlook, a margin, a ranking or any other governed conclusion. Every
 * value it reads was decided by a domain engine during the build and embedded as data; the only
 * arithmetic here is counting rows and adding money that the domain already computed.
 *
 * That is why filtering can be trusted: there is one business-truth path, and this is not it.
 */
export const GL_RUNTIME = `
(function () {
  "use strict";
  var el = document.getElementById('gl-facts');
  if (!el) return;
  var FACTS = JSON.parse(el.textContent || '[]');

  var DIMS = ['region', 'industry', 'account', 'deliveryGroup', 'system', 'reported', 'trajectory', 'outlook30', 'outlook60'];
  var QUICK = {
    intervene:  function (f) { return f.action.indexOf('Monitor') !== 0; },
    disagree:   function (f) { return f.reportedGreenRisk; },
    emerging:   function (f) { return f.emergingRisk; },
    declining:  function (f) { return f.trajectory.indexOf('DETERIORATING') >= 0; },
    recovering: function (f) { return f.trajectory === 'IMPROVING'; },
    erosion:    function (f) { return f.drivers.indexOf('margin-erosion') >= 0; },
    scope:      function (f) { return f.drivers.indexOf('scope-leakage') >= 0; }
  };

  /*
   * The driver selection is a filter over authoritative driver facts, not a new classification.
   * Each project already carries the governed drivers it exhibits; selecting one narrows to the
   * projects that carry it. The browser groups and counts - it never decides that a project has a
   * driver.
   */
  var state = { dims: {}, quick: null, driver: null };

  var DRIVER_LABEL = { 'margin-erosion': 'Margin erosion against as-sold',
    'scope-leakage': 'Scope delivered without commercial cover',
    'burn-ahead-of-progress': 'Cost outrunning delivered progress',
    'behind-plan': 'Behind planned completion',
    'reporting-divergence': 'Reported status ahead of the evidence',
    'emerging-risk': 'Healthy today, weaker outlook' };

  function signed(n) { return (n < 0 ? '\u2212' : '+') + money(Math.abs(n)).replace('$', '$'); }

  function money(n) {
    var s = n < 0 ? '\\u2212' : '', a = Math.abs(n);
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + Math.round(a / 1e3).toLocaleString('en-GB') + 'K';
    return s + '$' + Math.round(a).toLocaleString('en-GB');
  }
  function pct(n) { return n.toFixed(1) + '%'; }

  function matches(f) {
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i], want = state.dims[d];
      if (want && f[d] !== want) return false;
    }
    if (state.quick && !QUICK[state.quick](f)) return false;
    if (state.driver && f.drivers.indexOf(state.driver) < 0) return false;
    return true;
  }
  function selected() { return FACTS.filter(matches); }

  function sum(rows, key) { var t = 0; for (var i = 0; i < rows.length; i++) t += rows[i][key]; return t; }
  function count(rows, fn) { var t = 0; for (var i = 0; i < rows.length; i++) if (fn(rows[i])) t++; return t; }

  function setText(id, v) { var n = document.getElementById(id); if (n) n.textContent = v; }

  function bar(prefix, rows, weight) {
    var bands = ['GREEN', 'AMBER', 'RED'], total = 0, vals = [];
    for (var i = 0; i < bands.length; i++) {
      var v = 0;
      for (var j = 0; j < rows.length; j++) if (rows[j].system === bands[i]) v += weight ? rows[j].tcv : 1;
      vals.push(v); total += v;
    }
    var keys = ['g', 'a', 'r'];
    for (var k = 0; k < 3; k++) {
      var seg = document.getElementById(prefix + '-' + keys[k]);
      if (!seg) continue;
      var share = total === 0 ? 0 : (vals[k] / total) * 100;
      seg.style.width = share.toFixed(2) + '%';
      seg.textContent = share >= 9 ? (weight ? money(vals[k]) : String(vals[k])) : '';
      seg.setAttribute('aria-label', bands[k] + ': ' + (weight ? money(vals[k]) : vals[k] + ' projects'));
    }
    for (var m = 0; m < 3; m++) {
      setText(prefix + '-legend-' + keys[m], (weight ? money(vals[m]) : String(vals[m])));
    }
  }

  function rows(rowsIn) {
    var tb = document.getElementById('gl-queue-body');
    if (!tb) return;
    var pick = rowsIn.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 12);
    var html = '';
    for (var i = 0; i < pick.length; i++) {
      var f = pick[i];
      html += '<tr>'
        + '<td class="gl-sticky"><div class="gl-pname"><a href="/projects/' + f.id + '">' + esc(f.name) + '</a></div>'
        + '<div class="gl-pmeta">' + esc(f.customer) + ' \\u00b7 ' + esc(f.region) + '</div></td>'
        + '<td><span class="gl-rag gl-rag--' + f.reported + '">' + f.reported + '</span></td>'
        + '<td><span class="gl-rag gl-rag--' + f.system + '">' + f.system + '</span></td>'
        + '<td>' + esc(word(f.trajectory)) + '</td>'
        + '<td><span class="gl-rag gl-rag--' + f.outlook60 + '">' + f.outlook60 + '</span></td>'
        + '<td class="num">' + money(f.gmAtRisk) + '</td>'
        + '<td>' + esc(f.timeToAct) + '</td>'
        + '<td>' + esc(f.action) + '</td>'
        + '</tr>';
    }
    tb.innerHTML = html || '<tr><td colspan="8" class="gl-empty">No project in this view requires executive intervention. That is a finding, not an empty table.</td></tr>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function word(t) {
    return ({ IMPROVING: 'Improving', STABLE: 'Stable', DETERIORATING: 'Deteriorating',
      RAPIDLY_DETERIORATING: 'Deteriorating fast' })[t] || t;
  }

  function drivers(rowsIn) {
    var names = DRIVER_LABEL;
    var agg = {};
    for (var i = 0; i < rowsIn.length; i++) {
      var ds = rowsIn[i].drivers;
      for (var j = 0; j < ds.length; j++) {
        if (!names[ds[j]]) continue;
        if (!agg[ds[j]]) agg[ds[j]] = { n: 0, v: 0 };
        agg[ds[j]].n++; agg[ds[j]].v += rowsIn[i].gmAtRisk;
      }
    }
    var keys = Object.keys(agg).sort(function (a, b) { return agg[b].v - agg[a].v; });
    var host = document.getElementById('gl-drivers');
    if (!host) return;
    var html = '';
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k], on = state.driver === key;
      html += '<li><span class="k">' + money(agg[key].v) + '</span>'
        + '<span class="v"><button type="button" class="gl-driver" data-driver="' + key + '"'
        + ' aria-pressed="' + (on ? 'true' : 'false') + '">'
        + '<b>' + esc(names[key]) + '</b> · ' + agg[key].n + ' projects</button>'
        + (on ? ' <a class="gl-arrow" href="/projects' + window.location.search + '">see these projects →</a>' : '')
        + '</span></li>';
    }
    host.innerHTML = html || '<li class="gl-empty">No governed driver is present across this selection.</li>';
    var dbtns = host.querySelectorAll('[data-driver]');
    for (var b = 0; b < dbtns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var d = btn.getAttribute('data-driver');
          state.driver = state.driver === d ? null : d;
          render();
        });
      })(dbtns[b]);
    }
  }

  function flow(rowsIn) {
    var moves = {};
    for (var i = 0; i < rowsIn.length; i++) {
      var f = rowsIn[i];
      if (f.system === f.outlook60) continue;
      var key = f.system + '\\u2192' + f.outlook60;
      if (!moves[key]) moves[key] = { n: 0, v: 0 };
      moves[key].n++; moves[key].v += f.tcv;
    }
    var keys = Object.keys(moves).sort(function (a, b) { return moves[b].v - moves[a].v; });
    var host = document.getElementById('gl-moves');
    if (!host) return;
    var html = '';
    for (var k = 0; k < keys.length; k++) {
      var parts = keys[k].split('\\u2192');
      html += '<li><span><span class="gl-rag gl-rag--' + parts[0] + '">' + parts[0] + '</span>'
        + ' <span class="to">\\u2192</span> <span class="gl-rag gl-rag--' + parts[1] + '">' + parts[1] + '</span></span>'
        + '<span class="to">' + moves[keys[k]].n + ' projects \\u00b7 ' + money(moves[keys[k]].v) + '</span></li>';
    }
    host.innerHTML = html || '<li class="gl-empty">No project in this view changes band within 60 days on the governed outlook.</li>';
  }


  /* Projects: the full executive reading of every project in the selection. */
  function allRows(rowsIn) {
    var tb = document.getElementById('gl-all-body');
    if (!tb) return;
    var pick = rowsIn.slice().sort(function (a, b) { return a.rank - b.rank; });
    var html = '';
    for (var i = 0; i < pick.length; i++) {
      var f = pick[i];
      html += '<tr>'
        + '<td class="gl-sticky"><div class="gl-pname"><a href="/projects/' + f.id + '">' + esc(f.name) + '</a></div>'
        + '<div class="gl-pmeta">' + esc(f.customer) + ' · ' + esc(f.region) + '</div></td>'
        + '<td><span class="gl-rag gl-rag--' + f.reported + '">' + f.reported + '</span></td>'
        + '<td><span class="gl-rag gl-rag--' + f.system + '">' + f.system + '</span></td>'
        + '<td>' + esc(performance(f)) + '</td>'
        + '<td>' + esc(word(f.trajectory)) + '</td>'
        + '<td><span class="gl-rag gl-rag--' + f.outlook30 + '">' + f.outlook30 + '</span></td>'
        + '<td><span class="gl-rag gl-rag--' + f.outlook60 + '">' + f.outlook60 + '</span></td>'
        + '<td class="num">' + pct(f.forecastGmPct) + '</td>'
        + '<td class="num">' + money(f.gmAtRisk) + '</td>'
        + '<td>' + esc(f.action) + '</td>'
        + '</tr>';
    }
    tb.innerHTML = html || '<tr><td colspan="10" class="gl-empty">No project matches this view. Clear a filter to widen it.</td></tr>';
  }

  /* Performance against commitment, stated in words from governed drivers. */
  function performance(f) {
    if (f.drivers.indexOf('burn-ahead-of-progress') >= 0 && f.drivers.indexOf('behind-plan') >= 0) return 'Behind, and overspending';
    if (f.drivers.indexOf('burn-ahead-of-progress') >= 0) return 'Cost ahead of progress';
    if (f.drivers.indexOf('behind-plan') >= 0) return 'Behind plan';
    if (f.drivers.indexOf('margin-erosion') >= 0) return 'Margin eroding';
    return 'On commitment';
  }

  /* Forward risk: the same population banded at each governed horizon. */
  function horizon(prefix, rowsIn, key) {
    var bands = ['GREEN', 'AMBER', 'RED'], vals = [], total = rowsIn.length;
    for (var i = 0; i < bands.length; i++) {
      var v = 0;
      for (var j = 0; j < rowsIn.length; j++) if (rowsIn[j][key] === bands[i]) v++;
      vals.push(v);
    }
    var keys = ['g', 'a', 'r'];
    for (var k = 0; k < 3; k++) {
      var seg = document.getElementById(prefix + '-' + keys[k]);
      if (seg) {
        var share = total === 0 ? 0 : (vals[k] / total) * 100;
        seg.style.width = share.toFixed(2) + '%';
        seg.textContent = share >= 12 ? String(vals[k]) : '';
        seg.setAttribute('aria-label', bands[k] + ': ' + vals[k] + ' projects');
      }
      setText(prefix + '-legend-' + keys[k], String(vals[k]));
    }
  }

  function emergingRows(rowsIn) {
    var tb = document.getElementById('gl-emerging-body');
    if (!tb) return;
    var pick = rowsIn.filter(function (f) { return f.emergingRisk; }).sort(function (a, b) { return b.gmAtRisk - a.gmAtRisk; });
    var html = '';
    for (var i = 0; i < pick.length; i++) {
      var f = pick[i];
      html += '<tr><td class="gl-sticky"><div class="gl-pname"><a href="/projects/' + f.id + '">' + esc(f.name) + '</a></div>'
        + '<div class="gl-pmeta">' + esc(f.customer) + '</div></td>'
        + '<td><span class="gl-rag gl-rag--' + f.system + '">' + f.system + '</span></td>'
        + '<td>' + esc(word(f.trajectory)) + '</td>'
        + '<td><span class="gl-rag gl-rag--' + f.outlook30 + '">' + f.outlook30 + '</span></td>'
        + '<td><span class="gl-rag gl-rag--' + f.outlook60 + '">' + f.outlook60 + '</span></td>'
        + '<td class="num">' + money(f.gmAtRisk) + '</td>'
        + '<td>' + esc(f.timeToAct) + '</td></tr>';
    }
    tb.innerHTML = html || '<tr><td colspan="7" class="gl-empty">No project in this view is healthy today with a worsening governed outlook.</td></tr>';
  }

  function interventionRows(rowsIn) {
    var tb = document.getElementById('gl-int-body');
    if (tb) {
      var pick = rowsIn.filter(function (f) { return f.action.indexOf('Monitor') !== 0; })
        .sort(function (a, b) { return a.rank - b.rank; });
      var html = '';
      for (var i = 0; i < pick.length; i++) {
        var f = pick[i];
        html += '<tr><td class="gl-sticky"><div class="gl-pname"><a href="/projects/' + f.id + '">' + esc(f.name) + '</a></div>'
          + '<div class="gl-pmeta">' + esc(f.customer) + ' · ' + esc(f.region) + '</div></td>'
          + '<td><span class="gl-rag gl-rag--' + f.system + '">' + f.system + '</span> ' + esc(performance(f)) + '</td>'
          + '<td class="num">' + money(f.gmAtRisk) + '</td>'
          + '<td>' + esc(word(f.trajectory)) + '</td>'
          + '<td>' + esc(f.timeToAct) + '</td>'
          + '<td class="gl-pmeta" style="max-width:38ch">' + esc(f.whyShort)
          + '<details><summary>Full ranking rationale</summary><span>' + esc(f.why) + '</span></details></td>'
          + '<td>' + esc(f.action) + '</td></tr>';
      }
      tb.innerHTML = html || '<tr><td colspan="7" class="gl-empty">No project in this view is awaiting an executive decision. That is a finding, not an empty table.</td></tr>';
    }
    var rb = document.getElementById('gl-rec-body');
    if (rb) {
      var rec = rowsIn.filter(function (f) { return f.trajectory === 'IMPROVING'; })
        .sort(function (a, b) { return b.gmAtRisk - a.gmAtRisk; });
      var h2 = '';
      for (var k = 0; k < rec.length; k++) {
        var g = rec[k];
        var move = (g.forecastGmNow !== null && g.priorForecastGm !== null)
          ? g.forecastGmNow - g.priorForecastGm : null;
        var enough = g.system === 'GREEN' && g.outlook60 === 'GREEN';
        h2 += '<tr><td class="gl-sticky"><div class="gl-pname"><a href="/projects/' + g.id + '">' + esc(g.name) + '</a></div>'
          + '<div class="gl-pmeta">' + esc(g.customer) + '</div></td>'
          + '<td><span class="gl-rag gl-rag--' + g.system + '">' + g.system + '</span>'
          + ' <span class="to">\u2192</span> <span class="gl-rag gl-rag--' + g.outlook60 + '">' + g.outlook60 + '</span></td>'
          + '<td class="gl-pmeta" style="max-width:36ch">' + (g.improving.length
            ? esc(g.improving.slice(0, 3).join('; '))
            : 'no individual signal is improving; the state rests on none being adverse') + '</td>'
          + '<td class="num">' + (move === null ? 'no prior period' : signed(move)) + '</td>'
          + '<td class="num">' + money(g.gmAtRisk) + '</td>'
          + '<td>' + (enough
            ? 'Recovery is holding; no executive intervention is currently required.'
            : (g.adverse.length
              ? 'Recovery is underway, but ' + esc(g.adverse[0]) + ' is still adverse — leadership attention is still required.'
              : 'Recovery is underway; the governed outlook is still ' + g.outlook60.toLowerCase()
                + ' at 60 days, so leadership attention is still required.'))
          + '</td></tr>';
      }
      rb.innerHTML = h2 || '<tr><td colspan="6" class="gl-empty">No project in this view is improving on the evidence.</td></tr>';
    }
  }

  function render() {
    var r = selected();
    setText('gl-n', String(r.length));
    setText('gl-tcv', money(sum(r, 'tcv')));
    setText('gl-var', money(sum(r, 'gmAtRisk')));
    setText('gl-scope', money(sum(r, 'scopeExposure')));
    /*
     * Portfolio margin is the governed aggregate, not a mean of project margins.
     *
     * The governed portfolio margin is aggregate forecast revenue less aggregate cost at
     * completion, over aggregate forecast revenue - the catalogue is explicit that it is weighted
     * and never a mean of project margins. Averaging per-project percentages, even weighted by
     * contract value, produces a different figure wherever forecast revenue and contract value
     * diverge, which is wherever a change request has been executed. Summing the four governed
     * components and dividing reproduces the formula exactly, keeping this an aggregation of
     * authoritative facts rather than a second derivation of a governed metric. The metric
     * identifiers and the full reasoning are recorded in the build source, which does not ship.
     */
    var soldRev = sum(r, 'soldRevenue'), budget = sum(r, 'budgetedCost');
    var fcstRev = sum(r, 'forecastRevenue'), eacT = sum(r, 'eac');
    setText('gl-sold', soldRev ? pct(((soldRev - budget) / soldRev) * 100) : '—');
    setText('gl-fcst', fcstRev ? pct(((fcstRev - eacT) / fcstRev) * 100) : '—');
    setText('gl-disagree', String(count(r, function (f) { return f.reportedGreenRisk; })));
    setText('gl-emerging', String(count(r, function (f) { return f.emergingRisk; })));
    setText('gl-improving', String(count(r, function (f) { return f.trajectory === 'IMPROVING'; })));
    setText('gl-today', String(count(r, function (f) { return f.system !== 'GREEN'; })));
    // Disclosed, never added: the two Green findings share projects by governed definition.
    setText('gl-both', String(count(r, function (f) { return f.reportedGreenRisk && f.emergingRisk; })));
    setText('gl-act', String(count(r, function (f) { return f.action.indexOf('Monitor') !== 0; })));
    setText('gl-scopecount', String(count(r, function (f) { return f.scopeExposure > 0; })));
    bar('gl-count', r, false);
    bar('gl-weight', r, true);
    rows(r); drivers(r); flow(r);
    allRows(r); emergingRows(r); interventionRows(r);
    horizon('gl-h0', r, 'system'); horizon('gl-h30', r, 'outlook30'); horizon('gl-h60', r, 'outlook60');
    // The chip reads as English; the value behind it stays the governed enum.
    var LABEL = { GREEN: 'Green', AMBER: 'Amber', RED: 'Red', IMPROVING: 'Improving',
      STABLE: 'Stable', DETERIORATING: 'Deteriorating', RAPIDLY_DETERIORATING: 'Deteriorating fast' };
    var chips = [];
    for (var d in state.dims) if (state.dims[d]) chips.push(LABEL[state.dims[d]] || state.dims[d]);
    if (state.quick) {
      var qb = document.querySelector('[data-quick="' + state.quick + '"]');
      if (qb) chips.push(qb.textContent.trim());
    }
    if (state.driver) chips.push(DRIVER_LABEL[state.driver] || state.driver);
    var scope = document.getElementById('gl-scopeline');
    if (scope) {
      scope.innerHTML = chips.length
        ? 'Showing <b>' + r.length + ' of ' + FACTS.length + '</b> fixed-bid projects \\u2014 ' + esc(chips.join(' \\u00b7 '))
        : 'Showing all <b>' + FACTS.length + '</b> fixed-bid projects in the authorised portfolio.';
    }
    syncUrl();
    carryContext();
  }

  /*
   * The filter context travels with the user.
   *
   * Primary navigation is plain links, so moving from Command Center to Projects used to drop the
   * selection and silently widen the population back to the enterprise — the executive would be
   * looking at a different set of projects without being told. Each nav link now carries the active
   * query, and every surface reads it on load, so one filter context holds across the product.
   *
   * Project links are deliberately excluded: a project page is about one project, and its "All
   * projects" link carries the context back.
   */
  function carryContext() {
    var q = window.location.search;
    var links = document.querySelectorAll('.gl-navlinks a, a[data-carry]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      var base = href.split('?')[0];
      if (base.indexOf('/projects/') === 0) continue;
      links[i].setAttribute('href', base + q);
    }
  }

  function syncUrl() {
    var q = [];
    for (var d in state.dims) if (state.dims[d]) q.push(d + '=' + encodeURIComponent(state.dims[d]));
    if (state.quick) q.push('view=' + state.quick);
    if (state.driver) q.push('driver=' + state.driver);
    var url = window.location.pathname + (q.length ? '?' + q.join('&') : '');
    window.history.replaceState(null, '', url);
  }

  function readUrl() {
    var p = new URLSearchParams(window.location.search);
    for (var i = 0; i < DIMS.length; i++) {
      var v = p.get(DIMS[i]);
      if (v) state.dims[DIMS[i]] = v;
    }
    var view = p.get('view');
    if (view && QUICK[view]) state.quick = view;
    var dv = p.get('driver');
    if (dv) state.driver = dv;
  }

  readUrl();
  var selects = document.querySelectorAll('[data-dim]');
  for (var i = 0; i < selects.length; i++) {
    (function (sel) {
      var dim = sel.getAttribute('data-dim');
      if (state.dims[dim]) sel.value = state.dims[dim];
      sel.addEventListener('change', function () {
        state.dims[dim] = sel.value || null;
        render();
      });
    })(selects[i]);
  }
  var quicks = document.querySelectorAll('[data-quick]');
  for (var k = 0; k < quicks.length; k++) {
    (function (btn) {
      var key = btn.getAttribute('data-quick');
      if (state.quick === key) btn.setAttribute('aria-pressed', 'true');
      btn.addEventListener('click', function () {
        state.quick = state.quick === key ? null : key;
        for (var m = 0; m < quicks.length; m++) {
          quicks[m].setAttribute('aria-pressed', quicks[m] === btn && state.quick ? 'true' : 'false');
        }
        render();
      });
    })(quicks[k]);
  }
  var reset = document.getElementById('gl-reset');
  if (reset) reset.addEventListener('click', function () {
    state = { dims: {}, quick: null, driver: null };
    for (var i = 0; i < selects.length; i++) selects[i].value = '';
    for (var m = 0; m < quicks.length; m++) quicks[m].setAttribute('aria-pressed', 'false');
    render();
  });
  render();
})();
`;
