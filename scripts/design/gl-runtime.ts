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
  /*
   * \`pop\` is an explicit governed population, carried in the URL.
   *
   * When an executive clicks a health band or a transition, what they mean is "these projects" —
   * not "re-run the filters and hope you get the same set". Carrying the ids means the Projects
   * surface shows exactly what was clicked, that the URL is a shareable statement of an analytical
   * position, and that Back restores the position rather than an approximation of it.
   */
  var state = { dims: {}, quick: null, driver: null, pop: null, popLabel: null };

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

  /*
   * Count agreement, mirroring @platform/language.
   *
   * The movement panel read "1 projects \u00b7 $25.53M" on a screen shown to a CDO. A product that
   * cannot say "1 project" is a product whose care shows unevenly, and unevenness is what a reader
   * generalises from. Mirrored rather than imported because this file is a string shipped to the
   * browser with no module system; the server-side rule it mirrors is the authority.
   */
  function plural(noun, n) {
    if (n === 1) return noun;
    if (/(s|x|z|ch|sh)$/.test(noun)) return noun + 'es';
    if (/[^aeiou]y$/.test(noun)) return noun.slice(0, -1) + 'ies';
    return noun + 's';
  }
  function countOf(n, noun) { return n + ' ' + plural(noun, n); }

  function matches(f) {
    for (var i = 0; i < DIMS.length; i++) {
      var d = DIMS[i], want = state.dims[d];
      if (want && f[d] !== want) return false;
    }
    if (state.quick && !QUICK[state.quick](f)) return false;
    if (state.driver && f.drivers.indexOf(state.driver) < 0) return false;
    if (state.pop && state.pop.indexOf(f.id) < 0) return false;
    return true;
  }
  function selected() { return FACTS.filter(matches); }

  function sum(rows, key) { var t = 0; for (var i = 0; i < rows.length; i++) t += rows[i][key]; return t; }
  function count(rows, fn) { var t = 0; for (var i = 0; i < rows.length; i++) if (fn(rows[i])) t++; return t; }

  function setText(id, v) { var n = document.getElementById(id); if (n) n.textContent = v; }

  /* ------------------------------------------------------------------ *
   * THE EXECUTIVE INTERACTION CONTRACT
   *
   *   hover / focus  = GLIMPSE      — who is in this, and what does it weigh
   *   click / Enter  = INVESTIGATE  — the exact governed population, named
   *
   * One primitive, bound to every decision-bearing aggregate, so the behaviour an executive learns
   * on a health band is the behaviour they get on a transition row. The alternative — a tooltip
   * library here, a click handler there — is how a product ends up with three interaction dialects
   * and a reader who trusts none of them.
   *
   * What it does NOT do: derive anything. The glimpse counts and sums authoritative facts and sorts
   * them. Band, trajectory, outlook, margin and exposure were all decided by a governed engine at
   * build time; the browser may select, and may not conclude.
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * EXECUTIVE LENSES
   *
   * A quick view is not a filter with a different name. Each of these asks a **different business
   * question**, and a page that answers all seven with one headline and one section order is
   * answering none of them: the reader has to work out for themselves which part of the page their
   * question is now in.
   *
   * So a lens sets the eyebrow, the headline and the lead sentence, and declares which sections are
   * primary, which are secondary, and which have nothing to say. The *facts* are untouched — the
   * same governed population, the same governed figures — what moves is the order in which the page
   * makes its argument.
   *
   * \`zeroMeans\` is the §20 distinction. A section that is empty *because of the lens* can be the
   * strongest thing on the page: zero System-Green among reported-Green disagreements says these
   * projects are not merely early-warning cases, they are live disagreements. A section that is
   * empty because it is irrelevant is just a hole, and holes are suppressed.
   * ------------------------------------------------------------------ */
  var LENS = {
    intervene: {
      eyebrow: 'Executive lens \u00b7 Needs intervention',
      h1: 'Where leadership attention <em>changes the outcome</em>.',
      lead: 'Ordered by the governed intervention ranking, not by severity. A loss already taken may '
        + 'need oversight; it is rarely where the next hour pays best.',
      primary: ['queue'], quiet: ['green', 'drivers']
    },
    disagree: {
      eyebrow: 'Executive lens \u00b7 Reported Green \u2014 evidence disagrees',
      h1: 'Where management still says Green and <em>the evidence already disagrees</em>.',
      lead: 'Delivery management reported these Green for the period. The governed assessment of '
        + 'current evidence says otherwise, and the gap \u2014 not either reading on its own \u2014 is the finding.',
      primary: ['health', 'queue'], quiet: ['drivers']
    },
    emerging: {
      eyebrow: 'Executive lens \u00b7 System Green \u2014 emerging risk',
      h1: 'What looks healthy today and <em>is likely to become a problem</em>.',
      lead: 'Assessed Green on the evidence today, with a governed 30- or 60-day outlook that turns. '
        + 'Nothing has failed yet, which is exactly why there is still time to act.',
      primary: ['heading'], quiet: ['queue']
    },
    declining: {
      eyebrow: 'Executive lens \u00b7 Deteriorating',
      h1: 'What is <em>getting worse</em>, and how fast.',
      lead: 'Trajectory read across successive observations, not a label applied at a review. The '
        + 'question this lens answers is where the direction of travel is wrong.',
      primary: ['heading', 'queue'], quiet: ['drivers']
    },
    recovering: {
      eyebrow: 'Executive lens \u00b7 Recovering',
      h1: 'Where intervention is working \u2014 and <em>whether it is working enough</em>.',
      lead: 'Improving across successive observations. Improvement is not sufficiency: the exposure '
        + 'that remains and the outlook that still turns are both stated.',
      primary: ['heading'], quiet: ['green', 'drivers']
    },
    erosion: {
      eyebrow: 'Executive lens \u00b7 Margin erosion',
      h1: 'Where we are <em>losing the economics we sold</em>.',
      lead: 'Forecast margin against the as-sold position, aggregated on the same basis so the two '
        + 'are comparable. This is a commercial reading, not a delivery one.',
      primary: ['drivers', 'queue'], quiet: ['green']
    },
    scope: {
      eyebrow: 'Executive lens \u00b7 Scope leakage',
      h1: 'Where we are delivering work <em>without commercial recovery</em>.',
      lead: 'Scope delivered without a change request covering it. Every figure here is work already '
        + 'done; the commercial question is whether it will ever be paid for.',
      primary: ['drivers'], quiet: ['green', 'heading']
    }
  };

  var DEFAULT_LENS = {
    eyebrow: 'Fixed-bid portfolio \u00b7 Chief Delivery Officer',
    h1: 'Where the portfolio stands, and <em>where to intervene first</em>.',
    lead: 'Every figure below is the governed assessment over the projects you are authorised for. '
      + 'Filters change the population, not the arithmetic.',
    primary: [], quiet: []
  };

  /**
   * Applies the active lens to the page's argument.
   *
   * Nothing here touches a number. It sets three strings and moves emphasis between sections that
   * were already there — which is the whole distinction between an executive lens and a filter.
   */
  function applyLens(rowsIn) {
    var L = (state.quick && LENS[state.quick]) || DEFAULT_LENS;
    var eb = document.getElementById('gl-lens-eyebrow');
    var h1 = document.getElementById('gl-lens-h1');
    var ld = document.getElementById('gl-lens-lead');
    if (eb) eb.textContent = L.eyebrow;
    if (h1) h1.innerHTML = L.h1;
    if (ld) ld.textContent = L.lead;

    var sections = document.querySelectorAll('[data-section]');
    for (var i = 0; i < sections.length; i++) {
      var key = sections[i].getAttribute('data-section');
      var host = sections[i].closest('.gl-band') || sections[i];
      var empty = sectionIsEmpty(key, rowsIn);
      host.removeAttribute('hidden');
      sections[i].classList.remove('gl-quiet');

      /*
       * Section-level emptiness is a *whole section with nothing in it*, which is a hole in the page
       * rather than a finding. Meaningful zeros are handled one level down by \`applyZeroStates\`,
       * where the block that owns the count also owns the sentence — this function has no business
       * knowing what a particular zero means.
       *
       * They were briefly both spelled \`data-zero\`, and the collision silently hid the *nine* beside
       * the zero it was explaining. Two mechanisms reaching for the same attribute name is a hazard
       * worth removing rather than renaming around.
       */
      if (empty) { host.setAttribute('hidden', 'hidden'); continue; }
      if (L.quiet.indexOf(key) >= 0) sections[i].classList.add('gl-quiet');
    }
  }

  /**
   * Zero states, as one rule rather than seven special cases (\u00a720, \u00a727).
   *
   * A block declares the count that governs it and the sentence to show when that count is zero.
   * When it is zero the explanatory prose and the investigation link are both withdrawn, and the
   * sentence takes their place.
   *
   * Withdrawing the link is the part that matters. "See these projects \u2192" above a zero led to an
   * empty table \u2014 an affordance that looks like an answer and delivers nothing, which is exactly
   * the false interactivity \u00a727 asks to be removed. The sentence that replaces it is not an
   * apology for emptiness: *"None of these is System Green"* is one of the strongest things the page
   * can say about a population of reported-Green disagreements.
   */
  function applyZeroStates() {
    var blocks = document.querySelectorAll('[data-count]');
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var target = document.getElementById(block.getAttribute('data-count'));
      var n = target ? globalThis.parseInt(target.textContent, 10) : NaN;
      var zero = n === 0;
      var conditional = block.querySelectorAll('[data-when="nonzero"]');
      for (var j = 0; j < conditional.length; j++) conditional[j].hidden = zero;
      var note = block.querySelector('[data-zero-note]');
      if (!note) {
        note = document.createElement('p');
        note.className = 'gl-note gl-zero';
        note.setAttribute('data-zero-note', '1');
        block.appendChild(note);
      }
      note.textContent = block.getAttribute('data-zero') || '';
      note.hidden = !zero;
    }
  }

  /** Whether a section has anything to say about this population. Counts facts; concludes nothing. */
  function sectionIsEmpty(key, rowsIn) {
    if (key === 'green') {
      return count(rowsIn, function (f) { return f.reportedGreenRisk; }) === 0
        && count(rowsIn, function (f) { return f.emergingRisk; }) === 0;
    }
    if (key === 'heading') {
      return count(rowsIn, function (f) { return f.system !== f.outlook60; }) === 0
        && count(rowsIn, function (f) { return f.trajectory === 'IMPROVING'; }) === 0;
    }
    if (key === 'queue') {
      return count(rowsIn, function (f) { return f.action.indexOf('Monitor') !== 0; }) === 0;
    }
    if (key === 'drivers') {
      return count(rowsIn, function (f) { return f.drivers.length > 0; }) === 0;
    }
    return rowsIn.length === 0;
  }

  var glimpse = null;
  var glimpseAnchor = null;
  var glimpseIds = [];
  var glimpseTitle = '';
  var closeTimer = null;

  /*
   * The panel is reachable, and closing it is deliberately lazy.
   *
   * It shipped with pointer-events:none and closed on the band's mouseleave, so the
   * "Investigate all 22" line at the bottom looked exactly like a control and could not be clicked:
   * moving toward it left the band and the panel vanished. That is the false interactivity this
   * primitive exists to remove, reintroduced by the primitive itself.
   *
   * So the panel accepts the pointer, and a close is scheduled rather than immediate — the short
   * delay is what lets a hand cross the gap between the band and the panel without the target
   * disappearing mid-travel. Entering either one cancels the pending close.
   */
  function cancelClose() {
    if (closeTimer !== null) { window.clearTimeout(closeTimer); closeTimer = null; }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = window.setTimeout(closeGlimpse, 160);
  }

  function closeGlimpse() {
    cancelClose();
    if (glimpse && glimpse.parentNode) glimpse.parentNode.removeChild(glimpse);
    glimpse = null;
    glimpseAnchor = null;
    glimpseIds = [];
  }

  /**
   * Renders the glimpse for a population.
   *
   * \`title\` names the state; the body states economic weight and economic exposure as two separate
   * lines, because conflating "this population is worth $25.53M" with "$25.53M is at risk" is the
   * single most damaging thing this panel could do. At most three projects are named — a glimpse is
   * an orientation, not a table, and the fourth row is where a tooltip starts becoming a dashboard.
   */
  function showGlimpse(host, title, band, ids) {
    closeGlimpse();
    if (!ids.length) return;
    var pop = FACTS.filter(function (f) { return ids.indexOf(f.id) >= 0; });
    var weight = 0, exposure = 0;
    for (var i = 0; i < pop.length; i++) { weight += pop[i].tcv; exposure += pop[i].gmAtRisk; }
    var top = pop.slice().sort(function (a, b) { return b.gmAtRisk - a.gmAtRisk; });

    var el = document.createElement('div');
    el.className = 'gl-glimpse';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    var rows = '';
    for (var k = 0; k < Math.min(3, top.length); k++) {
      rows += '<li><span>' + esc(top[k].name) + '</span><b>' + money(top[k].gmAtRisk) + '</b></li>';
    }
    var more = top.length - Math.min(3, top.length);
    el.innerHTML =
      '<p class="gl-glimpse__t">' + (band ? '<span class="gl-rag gl-rag--' + band + '">' + band + '</span> ' : '')
        + esc(title) + ' \u00b7 ' + countOf(pop.length, 'project') + '</p>'
      + '<dl class="gl-glimpse__f">'
      + '<div><dt>Population economic weight</dt><dd>' + money(weight) + '</dd>'
      + '<span>current contractual value</span></div>'
      + '<div><dt>Economic exposure</dt><dd>' + money(exposure) + '</dd>'
      + '<span>margin at risk</span></div></dl>'
      + '<p class="gl-glimpse__l">Largest exposures</p>'
      + '<ul class="gl-glimpse__p">' + rows + '</ul>'
      + (more > 0 ? '<p class="gl-glimpse__m">+' + countOf(more, 'more project') + '</p>' : '')
      + '<button type="button" class="gl-glimpse__a">'
      + (pop.length === 1 ? 'Open this project' : 'Investigate all ' + pop.length) + ' \u2192</button>';

    document.body.appendChild(el);
    positionGlimpse(el, host);
    glimpse = el;
    glimpseAnchor = host;
    glimpseIds = ids;
    glimpseTitle = title;

    // Hovering the panel keeps it; leaving it closes it on the same lazy schedule as the band.
    el.addEventListener('mouseenter', cancelClose);
    el.addEventListener('mouseleave', scheduleClose);
    var action = el.querySelector('.gl-glimpse__a');
    if (action) {
      action.addEventListener('click', function () {
        var chosen = glimpseIds.slice();
        var label = glimpseTitle;
        closeGlimpse();
        investigate(chosen, label);
      });
    }
  }

  /**
   * Places the panel beside its anchor, inside the viewport on both axes.
   *
   * A glimpse that opens off-screen is a glimpse nobody reads, and these anchors sit at the page
   * edges often enough for that to matter.
   */
  function positionGlimpse(el, host) {
    var r = host.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + (r.width / 2) - (w / 2)));
    var above = r.top > h + 16;
    el.style.left = left + 'px';
    el.style.top = (above ? r.top - h - 10 : r.bottom + 10) + window.scrollY + 'px';
    el.setAttribute('data-side', above ? 'above' : 'below');
  }

  /**
   * Where a population goes when it is investigated.
   *
   * One project opens that project, because a one-row table is a worse answer to "which project?"
   * than the project itself. Two or more open the existing Projects surface, narrowed by an explicit
   * population in the URL — not a new modal, and not a re-derivation: the ids travel, so the surface
   * shows exactly what was clicked and Back restores exactly what was left.
   */
  function investigate(ids, label) {
    if (!ids.length) return;
    if (ids.length === 1) { window.location.href = '/projects/' + ids[0]; return; }
    var q = window.location.search.replace(/[?&]pop=[^&]*/g, '').replace(/[?&]poplabel=[^&]*/g, '');
    if (q === '?') q = '';
    var sep = q ? '&' : '?';
    // The label travels with the ids so the Projects surface can say *why* it is showing these four
    // rather than presenting a population that appeared from nowhere.
    window.location.href = '/projects' + q + sep + 'pop=' + encodeURIComponent(ids.join(','))
      + (label ? '&poplabel=' + encodeURIComponent(label) : '');
  }

  /**
   * Binds glimpse and investigate to one element.
   *
   * Hover and focus both open it, Enter and Space both activate it, Escape and blur both close it.
   * Everything reachable with a mouse is reachable from the keyboard — an executive function that
   * only exists on hover is a function half the audience never finds.
   */
  function bindAggregate(el, title, band, idsFn) {
    if (!el || el.getAttribute('data-bound') === '1') return;
    el.setAttribute('data-bound', '1');
    var ids = idsFn();
    if (!ids.length) { el.removeAttribute('tabindex'); el.removeAttribute('role'); return; }
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.classList.add('gl-investigable');
    var open = function () { showGlimpse(el, title, band, idsFn()); };
    // The band is already in the title where it belongs; repeating it read "GREEN, GREEN" to a
    // screen reader, which is the kind of thing that only shows up if you listen to it.
    el.setAttribute('aria-label', title
      + (band && title.indexOf(band) < 0 ? ', ' + band : '') + ', '
      + countOf(ids.length, 'project') + ' — investigate');
    el.addEventListener('mouseenter', function () { cancelClose(); open(); });
    el.addEventListener('focus', open);
    el.addEventListener('mouseleave', scheduleClose);
    el.addEventListener('blur', scheduleClose);
    el.addEventListener('click', function () { investigate(idsFn(), title); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); investigate(idsFn(), title); }
      if (e.key === 'Escape') closeGlimpse();
    });
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeGlimpse(); });

  /*
   * Scrolling repositions the glimpse; it does not close it.
   *
   * Closing on scroll seemed obviously right and was wrong for the keyboard path: focusing a band
   * scrolls it into view, the scroll fired, and the glimpse the focus had just opened closed in the
   * same tick. A keyboard user got a focus ring and nothing else — the exact mouse-only executive
   * function §28 forbids, introduced by a line meant to be tidy.
   */
  window.addEventListener('scroll', function () {
    if (glimpse === null || glimpseAnchor === null) return;
    positionGlimpse(glimpse, glimpseAnchor);
  }, true);
  window.addEventListener('resize', closeGlimpse);

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
      seg.setAttribute('aria-label', bands[k] + ': ' + (weight ? money(vals[k]) : countOf(vals[k], 'project')));
    }
    for (var m = 0; m < 3; m++) {
      setText(prefix + '-legend-' + keys[m], (weight ? money(vals[m]) : String(vals[m])));
    }
    /*
     * Only the count bar carries the investigation path.
     *
     * Both bars describe the same three populations, so binding both would give an executive two
     * controls that do the same thing and no reason to prefer either. The count bar is where "which
     * projects?" is the natural next question; the value bar answers "how much does it weigh?", and
     * the glimpse on the count bar already states the weight.
     */
    if (!weight) {
      for (var q = 0; q < 3; q++) {
        (function (idx) {
          bindAggregate(document.getElementById(prefix + '-' + keys[idx]),
            'Assessed ' + bands[idx] + ' today', bands[idx], function () {
              return rows.filter(function (f) { return f.system === bands[idx]; })
                .map(function (f) { return f.id; });
            });
        })(q);
      }
    }
  }

  function rows(rowsIn) {
    var tb = document.getElementById('gl-queue-body');
    if (!tb) return;
    /*
     * Five, not twelve.
     *
     * Twelve rows here made the Command Center a second Interventions page, 1352px tall, directly
     * above a link to the real one. The Command Center's question is *where do I look first*; the
     * full queue belongs to the surface whose question is *what do I do about it*. Five is the
     * shortlist an executive can hold in their head, and the link below it is not decoration.
     */
    var pick = rowsIn.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 5);
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
        + '<b>' + esc(names[key]) + '</b> \u00b7 ' + countOf(agg[key].n, 'project') + '</button>'
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
          pushNext = true;
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
      if (!moves[key]) moves[key] = { n: 0, v: 0, r: 0, ids: [] };
      moves[key].n++; moves[key].v += f.tcv; moves[key].r += f.gmAtRisk; moves[key].ids.push(f.id);
    }
    var keys = Object.keys(moves).sort(function (a, b) { return moves[b].v - moves[a].v; });
    var host = document.getElementById('gl-moves');
    if (!host) return;
    var html = '';
    for (var k = 0; k < keys.length; k++) {
      var parts = keys[k].split('\\u2192');
      /*
       * Two figures, two labels, never one number.
       *
       * This row read "13 projects \u00b7 $127.99M" with nothing saying what the money was. A reader
       * has no way to tell contractual value from margin exposure, and the difference between them is
       * the difference between losing a customer and losing a margin. \u00a718 forbids the ambiguity;
       * the labels are the fix, and they are worth the width.
       */
      var mv = moves[keys[k]];
      html += '<li data-move="' + esc(keys[k]) + '">'
        + '<span class="gl-movepair"><span class="gl-rag gl-rag--' + parts[0] + '">' + parts[0] + '</span>'
        + '<span class="to">\\u2192</span><span class="gl-rag gl-rag--' + parts[1] + '">' + parts[1] + '</span></span>'
        + '<span class="gl-movefig"><b>' + mv.n + '</b><span>'
        + plural('project', mv.n) + '</span></span>'
        + '<span class="gl-movefig"><b>' + money(mv.v) + '</b><span>contractual value</span></span>'
        + '<span class="gl-movefig"><b>' + money(mv.r) + '</b><span>margin at risk</span></span></li>';
    }
    host.innerHTML = html || '<li class="gl-empty">No project in this view changes band within 60 days on the governed outlook.</li>';
    // A transition an executive can see and cannot open is the clearest possible way to say "this
    // matters, and you may not ask about it".
    var items = host.querySelectorAll('[data-move]');
    for (var x = 0; x < items.length; x++) {
      (function (li) {
        var mk = li.getAttribute('data-move');
        var p2 = mk.split('\u2192');
        li.removeAttribute('tabindex'); li.removeAttribute('role');
        bindAggregate(li, p2[0] + ' \u2192 ' + p2[1] + ' within 60 days', p2[1], function () {
          return moves[mk] ? moves[mk].ids : [];
        });
      })(items[x]);
    }
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
        seg.setAttribute('aria-label', bands[k] + ': ' + countOf(vals[k], 'project'));
      }
      setText(prefix + '-legend-' + keys[k], String(vals[k]));
    }
    var when = key === 'system' ? 'Assessed today'
      : key === 'outlook30' ? 'Governed outlook at 30 days' : 'Governed outlook at 60 days';
    for (var q = 0; q < 3; q++) {
      (function (idx) {
        bindAggregate(document.getElementById(prefix + '-' + keys[idx]),
          when + ' \u00b7 ' + bands[idx], bands[idx], function () {
          return rowsIn.filter(function (f) { return f[key] === bands[idx]; })
            .map(function (f) { return f.id; });
        });
      })(q);
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

  // The chip reads as English; the value behind it stays the governed enum.
  var LABEL = { GREEN: 'Green', AMBER: 'Amber', RED: 'Red', IMPROVING: 'Improving',
    STABLE: 'Stable', DETERIORATING: 'Deteriorating', RAPIDLY_DETERIORATING: 'Deteriorating fast' };

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
    var chips = [];
    for (var d in state.dims) if (state.dims[d]) chips.push(LABEL[state.dims[d]] || state.dims[d]);
    if (state.quick) {
      var qb = document.querySelector('[data-quick="' + state.quick + '"]');
      if (qb) chips.push(qb.textContent.trim());
    }
    if (state.driver) chips.push(DRIVER_LABEL[state.driver] || state.driver);
    if (state.popLabel) chips.push(state.popLabel);
    /*
     * The folded scope must say what it holds.
     *
     * A disclosure labelled "Portfolio scope" that hides three active filters would be worse than
     * the wall of dropdowns it replaced: the reader would be looking at a narrowed portfolio with no
     * visible reason. The summary names the active dimensions, and opens itself when any is set.
     */
    var scopeChips = [];
    for (var sd in state.dims) if (state.dims[sd]) scopeChips.push(LABEL[state.dims[sd]] || state.dims[sd]);
    var summary = document.getElementById('gl-scopesummary');
    if (summary) {
      summary.textContent = scopeChips.length
        ? scopeChips.join(' \u00b7 ')
        : 'all geographies, verticals and accounts';
      summary.classList.toggle('is-set', scopeChips.length > 0);
    }
    var fold = document.querySelector('.gl-scopefilters');
    if (fold && scopeChips.length > 0) fold.setAttribute('open', 'open');

    var scope = document.getElementById('gl-scopeline');
    if (scope) {
      scope.innerHTML = chips.length
        ? 'Showing <b>' + r.length + ' of ' + FACTS.length + '</b> fixed-bid projects \\u2014 ' + esc(chips.join(' \\u00b7 '))
        : 'Showing all <b>' + FACTS.length + '</b> fixed-bid projects in the authorised portfolio.';
    }
    applyLens(r);
    applyZeroStates();
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

  var pushNext = false;

  function syncUrl() {
    var q = [];
    for (var d in state.dims) if (state.dims[d]) q.push(d + '=' + encodeURIComponent(state.dims[d]));
    if (state.quick) q.push('view=' + state.quick);
    if (state.driver) q.push('driver=' + state.driver);
    if (state.pop) q.push('pop=' + encodeURIComponent(state.pop.join(',')));
    if (state.popLabel) q.push('poplabel=' + encodeURIComponent(state.popLabel));
    var url = window.location.pathname + (q.length ? '?' + q.join('&') : '');
    /*
     * A filter edit replaces; a lens or population change pushes.
     *
     * Every state change used to \`replaceState\`, so browser Back skipped the whole analytical
     * session and left the page. Pushing on the changes an executive would think of as "a step"
     * makes Back mean what they expect — undo the step — while typing through a dropdown does not
     * litter the history with six entries.
     */
    if (pushNext && url !== window.location.pathname + window.location.search) {
      window.history.pushState(null, '', url);
    } else {
      window.history.replaceState(null, '', url);
    }
    pushNext = false;
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
    var pop = p.get('pop');
    if (pop) state.pop = pop.split(',').filter(function (x) { return x; });
    var pl = p.get('poplabel');
    if (pl) state.popLabel = pl;
  }

  readUrl();

  /*
   * Back and Forward must restore the analytical position, not merely the URL.
   *
   * Without this the address bar changed and the page did not, which is worse than Back not working
   * at all: the executive is looking at one population while the URL claims another.
   */
  window.addEventListener('popstate', function () {
    state = { dims: {}, quick: null, driver: null, pop: null, popLabel: null };
    readUrl();
    var sels = document.querySelectorAll('[data-dim]');
    for (var i = 0; i < sels.length; i++) {
      var dim = sels[i].getAttribute('data-dim');
      sels[i].value = state.dims[dim] || '';
    }
    var qs = document.querySelectorAll('[data-quick]');
    for (var j = 0; j < qs.length; j++) {
      qs[j].setAttribute('aria-pressed',
        qs[j].getAttribute('data-quick') === state.quick ? 'true' : 'false');
    }
    closeGlimpse();
    render();
  });

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
        // A lens is a step in the investigation, so Back should undo it.
        pushNext = true;
        for (var m = 0; m < quicks.length; m++) {
          quicks[m].setAttribute('aria-pressed', quicks[m] === btn && state.quick ? 'true' : 'false');
        }
        render();
      });
    })(quicks[k]);
  }
  var reset = document.getElementById('gl-reset');
  if (reset) reset.addEventListener('click', function () {
    state = { dims: {}, quick: null, driver: null, pop: null, popLabel: null };
    pushNext = true;
    for (var i = 0; i < selects.length; i++) selects[i].value = '';
    for (var m = 0; m < quicks.length; m++) quicks[m].setAttribute('aria-pressed', 'false');
    render();
  });
  render();
})();
`;
