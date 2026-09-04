/**
 * The sign-in gate, shared by the Assistant and by Add Knowledge.
 *
 * ## Why this exists at all
 *
 * The runtime used to hand a session to anyone who asked for one, which meant a public URL was a
 * public compute endpoint: anyone could ask questions and upload files that the deployment paid to
 * parse. The server now requires a demo access code, and this is the surface that collects it.
 *
 * ## What it is careful not to do
 *
 * **It ships no code.** The access code is typed by a person and posted over TLS; nothing in this
 * bundle, in the HTML, or in any generated file contains it, so reading the page teaches an attacker
 * nothing they did not already know. The token that comes back is held in `sessionStorage` — this tab,
 * this sitting — rather than `localStorage`, because a demo credential that outlives the browser
 * window is a credential somebody forgot they had.
 *
 * The persona picker is part of the gate rather than a separate control, and it is not a permission:
 * choosing `dm.mobility` asks the server for that persona's authorised scope, and the server decides
 * what that is. That is exactly the point worth demonstrating in a browser — two people signing in to
 * the same page and seeing different portfolios, because the difference is resolved server-side.
 */
export const GL_ACCESS = `
(function () {
  'use strict';

  var PERSONAS = [
    { id: 'exec.cdo', label: 'Chief Delivery Officer — the whole portfolio' },
    { id: 'dir.emea', label: 'Delivery Director, EMEA — the European portfolio' },
    { id: 'dm.mobility', label: 'Delivery Manager, Mobility — a single account' }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function stored(base) {
    try { return window.sessionStorage.getItem('gldi.token.' + base); } catch (e) { return null; }
  }
  function remember(base, token) {
    try { window.sessionStorage.setItem('gldi.token.' + base, token); } catch (e) { /* private mode */ }
  }
  function forget(base) {
    try { window.sessionStorage.removeItem('gldi.token.' + base); } catch (e) { /* private mode */ }
  }

  /**
   * Asks for a session, prompting only when there isn't one.
   *
   * Resolves with a token, or with null when the visitor closes the panel — which is a legitimate
   * choice and leaves the page in its recorded-transcript mode rather than in a broken one.
   */
  function session(base, need) {
    var saved = stored(base);
    if (saved) return Promise.resolve(saved);
    /*
     * Ask the deployment what it will give a caller with no code, before asking a person.
     *
     * There is no client-side flag for "is this deployment open". The client cannot know, and a flag
     * baked into the bundle would be a second source of truth that drifts from the server's the
     * first time an operator changes one and not the other. So it simply asks.
     *
     * \`need\` is what this surface requires — 'full' for Data Sources, which writes. If the open
     * session already covers it, nobody is interrupted; if it does not, the person is asked. That
     * ordering matters: prompting first and checking afterwards would put a password box in front
     * of an open deployment, and accepting a read-only session for a surface that writes would fail
     * at the receipt, after the file had been chosen and mapped.
     */
    return fetch(base + '/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    }).then(function (r) {
      if (!r.ok) return prompt_(base);
      return r.json().then(function (payload) {
        var data = payload && payload.data;
        var token = data ? data.token : null;
        if (!token) return prompt_(base);
        if (need === 'full' && data.capability !== 'full') return prompt_(base);
        remember(base, token);
        return token;
      });
    }).catch(function () { return prompt_(base); });
  }

  function prompt_(base) {
    return new Promise(function (resolve) {
      var overlay = el('div', 'gl-gate');
      var card = el('form', 'gl-gate__card');
      card.setAttribute('novalidate', 'novalidate');

      card.appendChild(el('p', 'gl-gate__eyebrow', 'DEMO — SYNTHETIC DATA'));
      card.appendChild(el('h2', 'gl-gate__title', 'Sign in to the trusted runtime'));
      card.appendChild(el('p', 'gl-gate__body',
        'Answering a question and reading a file both run on the server, so this deployment asks for '
        + 'a demo access code before it will do either. Nothing here is real client data.'));

      var personaLabel = el('label', 'gl-gate__label', 'Sign in as');
      personaLabel.setAttribute('for', 'gl-gate-persona');
      var select = el('select', 'gl-gate__input');
      select.id = 'gl-gate-persona';
      for (var i = 0; i < PERSONAS.length; i += 1) {
        var opt = el('option', null, PERSONAS[i].label);
        opt.value = PERSONAS[i].id;
        select.appendChild(opt);
      }

      var codeLabel = el('label', 'gl-gate__label', 'Demo access code');
      codeLabel.setAttribute('for', 'gl-gate-code');
      var code = el('input', 'gl-gate__input');
      code.id = 'gl-gate-code';
      code.type = 'password';
      code.autocomplete = 'off';
      code.setAttribute('spellcheck', 'false');

      var error = el('p', 'gl-gate__error');
      error.hidden = true;
      error.setAttribute('role', 'alert');

      var actions = el('div', 'gl-gate__actions');
      var submit = el('button', 'gl-gate__go', 'Sign in');
      submit.type = 'submit';
      var cancel = el('button', 'gl-gate__skip', 'Browse the recorded run instead');
      cancel.type = 'button';
      actions.appendChild(submit);
      actions.appendChild(cancel);

      card.appendChild(personaLabel);
      card.appendChild(select);
      card.appendChild(codeLabel);
      card.appendChild(code);
      card.appendChild(error);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      code.focus();

      function close(value) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      }

      function fail(message) {
        error.textContent = message;
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Sign in';
        code.focus();
        code.select();
      }

      cancel.addEventListener('click', function () { close(null); });

      card.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!code.value) { fail('Enter the demo access code.'); return; }
        submit.disabled = true;
        submit.textContent = 'Signing in…';
        error.hidden = true;
        fetch(base + '/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ persona: select.value, accessCode: code.value })
        }).then(function (r) {
          return r.json().then(function (payload) { return { ok: r.ok, status: r.status, payload: payload }; });
        }).then(function (result) {
          if (result.status === 401) { fail('That code was not accepted.'); return; }
          if (result.status === 503) {
            fail((result.payload && result.payload.detail) || 'This deployment is not open.');
            return;
          }
          var token = result.ok && result.payload && result.payload.data
            ? result.payload.data.token : null;
          if (!token) { fail('The runtime did not return a session.'); return; }
          remember(base, token);
          close(token);
        }).catch(function () {
          fail('The runtime could not be reached.');
        });
      });
    });
  }

  window.GLAccess = { session: session, forget: forget, personas: PERSONAS };
}());
`;

/** The gate's styling. Kept beside the behaviour so a page cannot ship one without the other. */
export const GL_ACCESS_CSS = `
/* The gate, in the site's own language: white panel, soft radius, orange reserved for the one action. */
.gl-gate{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:24px;
  background:rgba(24,26,36,.55)}
.gl-gate__card{width:min(430px,100%);display:flex;flex-direction:column;gap:10px;padding:32px;
  background:var(--white);border-radius:14px;
  box-shadow:0 1px 2px rgba(24,26,36,.06),0 24px 60px rgba(24,26,36,.28)}
.gl-gate__eyebrow{margin:0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--steel-50)}
.gl-gate__title{margin:0;font-size:22px;line-height:1.15;letter-spacing:-.02em;color:var(--steel-100)}
.gl-gate__body{margin:0 0 6px;font-size:13.5px;line-height:1.55;color:var(--steel-75)}
.gl-gate__label{margin-top:8px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--steel-50)}
.gl-gate__input{width:100%;padding:10px 12px;font:inherit;font-size:14px;color:var(--steel-100);
  background:var(--white);border:1px solid var(--rule-strong);border-radius:8px}
.gl-gate__input:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.gl-gate__error{margin:6px 0 0;font-size:13px;color:var(--rag-red)}
.gl-gate__actions{display:flex;flex-direction:column;gap:6px;margin-top:16px}
.gl-gate__go{padding:11px 16px;font:inherit;font-size:14px;font-weight:600;color:var(--white);
  background:var(--orange);border:0;border-radius:8px;cursor:pointer}
.gl-gate__go:hover{background:var(--orange-deep)}
.gl-gate__go[disabled]{opacity:.55;cursor:default}
.gl-gate__skip{padding:8px;font:inherit;font-size:13px;color:var(--steel-50);background:none;border:0;
  cursor:pointer;text-decoration:underline}
.gl-gate__skip:hover{color:var(--steel-75)}
`;
