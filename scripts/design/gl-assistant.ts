/**
 * The Assistant workspace and Knowledge & Connections surfaces (§60, §85, §86).
 *
 * ## Not a chatbot
 *
 * §85 is explicit, and it is a product judgement rather than a style preference. Consumer chat
 * conventions — bubbles, avatars, a typing indicator, an assistant persona — tell a reader they are
 * talking to *something* whose answers are its own. In this product the answers are the portfolio's,
 * the model is a narrator that can be switched off without losing them, and the interface should say
 * so at a glance. So: one composition, in editorial order.
 *
 *   CURRENT SCOPE  ·  ASK  ·  EXECUTIVE ANSWER  ·  WHY  ·  EVIDENCE  ·  PROVENANCE  ·  FOLLOW-UP
 *
 * The scope line sits **above** the answer deliberately. It is the honesty control of ADR-0034 §7: a
 * filter the product failed to understand must be visible as an absence before the reader has
 * finished reading a confident number, not discoverable afterwards.
 *
 * ## The runtime
 *
 * First-party, no dependency, no `eval`, no `Function`, no inline event-handler attribute, and no
 * HTML built from response data by string concatenation — every value reaches the DOM through
 * `textContent`. That is not belt-and-braces: the response contains document text a stranger wrote,
 * and `innerHTML` on that path is how an evidence quotation becomes script execution.
 *
 * ## Degradation is a demonstration, not a fallback
 *
 * When the trusted runtime is not reachable — which is the case on the static public preview, where
 * no server is deployed — the page says so precisely and shows a **recorded** transcript from a real
 * run, dated and labelled. It does not simulate a live answer. A product whose demo fakes the thing
 * it is demonstrating has nothing left to be trusted about.
 */

export const GL_ASSISTANT_CSS = `
.gl-ask{margin-top:26px;border-top:2px solid var(--steel-100);padding-top:22px}
.gl-ask form{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.gl-ask label{flex:1 1 460px;display:block;font-size:12px;letter-spacing:.11em;
  text-transform:uppercase;color:var(--steel-50);font-weight:600}
.gl-ask input[type=text]{width:100%;margin-top:8px;padding:14px 16px;font:inherit;font-size:17px;
  border:1px solid var(--rule-strong);border-radius:10px;background:var(--white);color:inherit}
.gl-ask input[type=text]:focus{outline:2px solid var(--orange);outline-offset:1px;border-color:var(--orange)}
.gl-ask button{margin-top:29px;padding:14px 26px;font:inherit;font-weight:600;font-size:15px;
  border:0;border-radius:10px;background:var(--steel-100);color:var(--white);cursor:pointer}
.gl-ask button:hover{background:var(--orange-deep)}
.gl-ask button:disabled{background:var(--steel-25);cursor:progress}
.gl-suggest{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px}
.gl-suggest button{margin:0;padding:7px 13px;font-size:13.5px;font-weight:500;border-radius:999px;
  background:var(--white);color:var(--steel-75);border:1px solid var(--rule-strong)}
.gl-suggest button:hover{border-color:var(--orange);color:var(--orange-deep);background:var(--white)}

.gl-scopebar{margin-top:22px;padding:14px 18px;background:var(--white);border-left:3px solid var(--orange);
  border-radius:0 8px 8px 0}
.gl-scopebar dt{font-size:11.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--steel-50);
  font-weight:600}
.gl-scopebar dd{margin:5px 0 0;font-size:16px;font-weight:500}
.gl-scopebar .gl-read{margin-top:8px;font-size:13px;color:var(--steel-50)}

.gl-answer{margin-top:30px}
.gl-answer h2{font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:var(--steel-50)}
.gl-answer .gl-prose{margin-top:12px;font-size:20px;line-height:1.5;max-width:74ch;
  letter-spacing:-0.006em}
.gl-answer .gl-prose:empty{display:none}
.gl-why{margin-top:24px;padding:0;list-style:none;max-width:84ch}
.gl-why li{padding:11px 0 11px 20px;border-top:1px solid var(--rule);position:relative;font-size:15px;
  color:var(--steel-75)}
.gl-why li::before{content:"";position:absolute;left:0;top:19px;width:8px;height:1px;background:var(--steel-25)}

.gl-badges{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px}
.gl-badge{display:inline-flex;align-items:baseline;gap:7px;padding:6px 12px;border-radius:999px;
  font-size:12.5px;background:var(--white);border:1px solid var(--rule-strong)}
.gl-badge b{font-weight:600}
.gl-badge--warn{border-color:var(--orange);color:var(--orange-deep)}
.gl-badge--flat{background:transparent}

.gl-disclose{margin-top:26px;border-top:1px solid var(--rule)}
.gl-disclose summary{padding:14px 0;cursor:pointer;font-size:13.5px;font-weight:600;
  color:var(--steel-75);list-style:none}
.gl-disclose summary::-webkit-details-marker{display:none}
.gl-disclose summary::before{content:"+ ";color:var(--orange);font-weight:700}
.gl-disclose[open] summary::before{content:"– "}
.gl-disclose > div{padding-bottom:20px}

.gl-prov{width:100%;border-collapse:collapse;font-size:13.5px}
.gl-prov th{text-align:left;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--steel-50);padding:8px 12px 8px 0;border-bottom:1px solid var(--rule-strong);font-weight:600}
.gl-prov td{padding:9px 12px 9px 0;border-bottom:1px solid var(--rule);vertical-align:top}
.gl-prov td:first-child{color:var(--steel-50);white-space:nowrap}
.gl-prov .gl-num{font-weight:600;white-space:nowrap}

.gl-srcgrid{margin-top:22px;width:100%;border-collapse:collapse;font-size:14px}
.gl-srcgrid th{text-align:left;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;
  color:var(--steel-50);padding:10px 14px 10px 0;border-bottom:2px solid var(--steel-100);font-weight:600}
.gl-srcgrid td{padding:12px 14px 12px 0;border-bottom:1px solid var(--rule);vertical-align:top}
.gl-status{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:600;
  border:1px solid var(--rule-strong);white-space:nowrap}
.gl-status--REAL_VERIFIED{color:var(--green);background:var(--rag-green-bg);border-color:var(--green-light)}
.gl-status--FIXTURE{color:var(--steel-75);background:var(--steel-05)}
.gl-status--INGESTED{color:var(--blue-deep);background:var(--blue-light);border-color:var(--blue-light)}
.gl-status--NOT_CONFIGURED{color:var(--steel-50);background:transparent}
.gl-status--MAPPING_REVIEW_REQUIRED{color:var(--orange-deep);background:var(--white);border-color:var(--orange)}

.gl-offline{margin-top:22px;padding:16px 18px;border:1px solid var(--orange);border-radius:10px;
  background:var(--white)}
.gl-offline b{color:var(--orange-deep)}
@media (max-width:720px){
  .gl-ask button{margin-top:12px;width:100%}
  .gl-prov,.gl-srcgrid{font-size:13px}
}
`;

/**
 * The client runtime.
 *
 * Written as a plain string of ES5-compatible JavaScript for the same reason `gl-runtime.ts` is:
 * the build emits it inline, there is no bundler, and the Content-Security-Policy on the published
 * site permits inline script and nothing else. No `eval`, no `Function`, no `innerHTML` on any path
 * that touches response data.
 */
export const GL_ASSISTANT_RUNTIME = `
(function () {
  'use strict';

  var out = document.getElementById('gl-out');
  var form = document.getElementById('gl-askform');
  var input = document.getElementById('gl-q');
  var button = document.getElementById('gl-send');
  var status = document.getElementById('gl-conn');
  if (!out || !form || !input || !button) return;

  var recordedNode = document.getElementById('gl-recorded');
  var recorded = null;
  if (recordedNode) { try { recorded = JSON.parse(recordedNode.textContent || 'null'); } catch (e) { recorded = null; } }

  /*
   * Where the trusted runtime lives.
   *
   * Same origin first, because a deployment that serves both is the normal case. Loopback second, so
   * a developer running \`npm run server\` gets a live page without configuring anything. Nothing
   * else is ever tried: probing further would be this page deciding where to send a question.
   */
  var BASES = [window.location.origin + '/api', 'http://127.0.0.1:8080/api'];
  var base = null;
  var token = null;
  var state = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setStatus(text, warn) {
    if (!status) return;
    status.textContent = text;
    status.className = warn ? 'gl-badge gl-badge--warn' : 'gl-badge';
  }

  function post(path, body) {
    var headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    return fetch(base + path, { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(String(r.status))); });
  }

  function connect(index) {
    if (index >= BASES.length) {
      setStatus('Trusted runtime not reachable — showing a recorded run', true);
      showOffline();
      return Promise.resolve(false);
    }
    base = BASES[index];
    return fetch(base + '/health', { method: 'GET' })
      .then(function (r) { if (!r.ok) throw new Error('unhealthy'); return r.json(); })
      .then(function () {
        return post('/session', { persona: 'exec.cdo' });
      })
      .then(function (payload) {
        token = payload && payload.data ? payload.data.token : null;
        if (!token) throw new Error('no session');
        setStatus('Connected to the trusted runtime', false);
        button.disabled = false;
        return true;
      })
      .catch(function () { return connect(index + 1); });
  }

  function showOffline() {
    out.textContent = '';
    var box = el('div', 'gl-offline');
    box.appendChild(el('p', null,
      'This static preview has no trusted runtime behind it, so questions cannot be answered live. '
      + 'Running the server locally makes this page live against the same engine; nothing about the '
      + 'answers changes, because the answers were never produced here.'));
    var p = el('p', 'gl-note');
    p.style.marginTop = '10px';
    p.textContent = 'Below is a recorded run of the real engine, captured at build time. It is a '
      + 'transcript, not a simulation: every figure in it came from the governed services.';
    box.appendChild(p);
    out.appendChild(box);
    if (recorded && recorded.turns) {
      for (var i = 0; i < recorded.turns.length; i += 1) render(recorded.turns[i], true);
    }
  }

  function badge(label, value, warn) {
    var b = el('span', warn ? 'gl-badge gl-badge--warn' : 'gl-badge');
    b.appendChild(el('span', null, label));
    b.appendChild(el('b', null, value));
    return b;
  }

  function disclosure(summaryText, build) {
    var d = el('details', 'gl-disclose');
    d.appendChild(el('summary', null, summaryText));
    var body = el('div');
    build(body);
    d.appendChild(body);
    return d;
  }

  function render(data, isRecorded) {
    var block = el('article', 'gl-answer');

    var q = el('p', 'gl-eyebrow', (isRecorded ? 'Recorded question · ' : 'Question · ') + (data.question || ''));
    block.appendChild(q);

    // Scope first. A filter the product failed to understand must be visible before the answer is.
    var scope = el('dl', 'gl-scopebar');
    scope.appendChild(el('dt', null, 'Current scope'));
    scope.appendChild(el('dd', null, data.scopeLine || 'the whole fixed-bid portfolio'));
    if (data.recognised && data.recognised.length) {
      scope.appendChild(el('p', 'gl-read', 'Read as: ' + data.recognised.join(' · ')));
    }
    block.appendChild(scope);

    block.appendChild(el('h2', null, 'Executive answer'));
    block.appendChild(el('p', 'gl-prose', data.answer || ''));

    if (data.why && data.why.length) {
      var why = el('ul', 'gl-why');
      for (var i = 0; i < data.why.length; i += 1) why.appendChild(el('li', null, data.why[i]));
      block.appendChild(why);
    }

    var badges = el('div', 'gl-badges');
    badges.appendChild(badge('Answerability', String(data.answerability && data.answerability.classification || '—'),
      data.answerability && data.answerability.classification !== 'ANSWERABLE'));
    badges.appendChild(badge('Authority', String(data.executiveAuthority || '—'), false));
    badges.appendChild(badge('Composed by',
      data.composer === 'LLM_NARRATION' ? 'Language model, grounded' : 'Governed deterministic composer', false));
    if (data.evidence) {
      badges.appendChild(badge('Evidence', data.evidence.authority + ' authority · ' + data.evidence.coverage + ' coverage', false));
    }
    if (data.provider && data.provider.external) {
      badges.appendChild(badge('Processing', 'External model (' + (data.provider.model || '') + ')', true));
    }
    block.appendChild(badges);

    if (data.answerability && data.answerability.gaps && data.answerability.gaps.length) {
      block.appendChild(disclosure('What this answer does not cover', function (body) {
        var list = el('ul', 'gl-why');
        for (var g = 0; g < data.answerability.gaps.length; g += 1) {
          list.appendChild(el('li', null, data.answerability.gaps[g]));
        }
        body.appendChild(list);
      }));
    }

    if (data.claims && data.claims.length) {
      block.appendChild(disclosure('Claims and provenance (' + data.claims.length + ')', function (body) {
        var table = el('table', 'gl-prov');
        var head = el('thead');
        var hr = el('tr');
        ['Layer', 'Finding', 'Figure', 'Metric'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
        head.appendChild(hr); table.appendChild(head);
        var tbody = el('tbody');
        for (var c = 0; c < data.claims.length; c += 1) {
          var claim = data.claims[c];
          var tr = el('tr');
          tr.appendChild(el('td', null, claim.layer));
          tr.appendChild(el('td', null, claim.text));
          tr.appendChild(el('td', 'gl-num', claim.display || '—'));
          tr.appendChild(el('td', null, claim.metricId || '—'));
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        var wrap = el('div');
        wrap.style.overflowX = 'auto';
        wrap.appendChild(table);
        body.appendChild(wrap);
      }));
    }

    if (data.plan) {
      block.appendChild(disclosure('How the question was interpreted', function (body) {
        var table = el('table', 'gl-prov');
        var tbody = el('tbody');
        var rows = [
          ['Shape', data.plan.shape],
          ['Scope', data.plan.scope],
          ['Period', data.plan.time],
          ['Ordering', data.plan.sort],
          ['Limit', String(data.plan.limit)],
          ['Interpreted by', data.plan.origin === 'MODEL_PROPOSED'
            ? 'A model proposed this plan and the validator accepted it'
            : data.plan.origin === 'CONVERSATION_REFINEMENT'
              ? 'A refinement of the previous question'
              : 'The deterministic planner, with no model involved']
        ];
        for (var r = 0; r < rows.length; r += 1) {
          var tr = el('tr');
          tr.appendChild(el('td', null, rows[r][0]));
          tr.appendChild(el('td', null, rows[r][1]));
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        body.appendChild(table);
      }));
    }

    if (data.suggestedFollowUps && data.suggestedFollowUps.length) {
      var follow = el('div', 'gl-suggest');
      for (var f = 0; f < data.suggestedFollowUps.length; f += 1) {
        var s = data.suggestedFollowUps[f];
        var b = el('button', null, s.label);
        b.type = 'button';
        b.setAttribute('data-ask', s.label);
        follow.appendChild(b);
      }
      block.appendChild(follow);
    }

    out.insertBefore(block, out.firstChild);
  }

  function ask(question) {
    if (!base || !token) { showOffline(); return; }
    button.disabled = true;
    setStatus('Asking…', false);
    post('/ask', { question: question, state: state, narrate: true })
      .then(function (payload) {
        var data = payload.data;
        data.question = question;
        state = data.state;
        render(data, false);
        setStatus('Connected to the trusted runtime', false);
      })
      .catch(function () {
        setStatus('The trusted runtime did not answer', true);
      })
      .then(function () { button.disabled = false; input.value = ''; input.focus(); });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var q = String(input.value || '').trim();
    if (q !== '') ask(q);
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var preset = target.getAttribute('data-ask');
    if (!preset) return;
    event.preventDefault();
    input.value = preset;
    ask(preset);
  });

  button.disabled = true;
  setStatus('Looking for the trusted runtime…', false);
  connect(0);
}());
`;
