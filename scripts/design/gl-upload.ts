/**
 * The Add Knowledge surface — the upload flow (§89).
 *
 * ```
 * Select file → Parse → Profile → Map → Validate → Preview → Confirm → Ingestion receipt
 * ```
 *
 * Every one of those steps is visible, and the two that matter most are the ones a convenient
 * implementation would remove.
 *
 * **Mapping is confirmed, never assumed.** A mapping decides which column becomes which governed
 * concept, and a wrong one is invisible afterwards: the rows load, the counts look right, and a cost
 * column has quietly become an estimate. Suggestions are offered as `EXACT` or `LIKELY` — two states,
 * because the decision they drive is binary — and a `LIKELY` suggestion is left **unselected** so
 * that accepting it is an act rather than an omission.
 *
 * **Authority is not on this screen.** There is no control that sets it, because an upload is
 * `SUPPLEMENTAL` and nothing a person does here may change that. §89's *"do not silently elevate
 * anything to AUTHORITATIVE"* is satisfied by there being no path to elevate it at all — the server
 * assigns the class and ignores whatever the request said (ADR-0035 §4).
 *
 * ## Degradation
 *
 * Uploading needs the trusted runtime: it parses untrusted bytes and it must not happen in a
 * browser. With no runtime the controls are disabled and say why, in the same way the Assistant's
 * input does. A file picker that silently does nothing is worse than one that explains itself.
 */

export const GL_UPLOAD_CSS = `
.gl-upload{margin-top:26px;border-top:2px solid var(--steel-100);padding-top:24px}
.gl-steps{display:flex;flex-wrap:wrap;gap:0;margin:0 0 24px;padding:0;list-style:none;
  counter-reset:step}
.gl-steps li{counter-increment:step;font-size:12.5px;color:var(--steel-50);padding:0 16px 0 0;
  position:relative;display:flex;align-items:center;gap:7px}
.gl-steps li::before{content:counter(step);width:20px;height:20px;border-radius:50%;flex:none;
  display:grid;place-items:center;font-size:11px;font-weight:600;
  background:var(--steel-05);color:var(--steel-50);border:1px solid var(--rule-strong)}
.gl-steps li[data-state="done"]{color:var(--steel-100)}
.gl-steps li[data-state="done"]::before{background:var(--steel-100);color:var(--white);
  border-color:var(--steel-100)}
.gl-steps li[data-state="active"]{color:var(--orange-deep);font-weight:600}
.gl-steps li[data-state="active"]::before{background:var(--orange);color:var(--white);
  border-color:var(--orange)}

.gl-drop{display:block;padding:26px;border:1px dashed var(--rule-strong);border-radius:12px;
  background:var(--white);cursor:pointer}
.gl-drop:hover{border-color:var(--orange)}
.gl-drop:focus-within{outline:2px solid var(--orange);outline-offset:2px}
.gl-drop b{display:block;font-size:16px}
.gl-drop span{display:block;margin-top:5px;font-size:13.5px;color:var(--steel-50)}
.gl-drop input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.gl-drop[aria-disabled="true"]{opacity:.55;cursor:not-allowed;border-style:solid}

.gl-maprow{display:grid;grid-template-columns:1fr 1fr auto;gap:14px;align-items:center;
  padding:11px 0;border-bottom:1px solid var(--rule)}
.gl-maprow b{font-weight:600;font-size:14px}
.gl-maprow .gl-why{margin:3px 0 0;padding:0;font-size:12.5px;color:var(--steel-50);border:0}
.gl-maprow select{padding:8px 10px;font:inherit;font-size:13.5px;border-radius:8px;
  border:1px solid var(--rule-strong);background:var(--white);max-width:100%}
.gl-conf{font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;
  padding:3px 9px;border-radius:999px;white-space:nowrap}
.gl-conf--EXACT{color:var(--green);background:var(--rag-green-bg)}
.gl-conf--LIKELY{color:var(--orange-deep);background:var(--white);border:1px solid var(--orange)}
.gl-conf--NONE{color:var(--steel-50);background:var(--steel-05)}

.gl-actions{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}
.gl-actions button{padding:12px 22px;font:inherit;font-weight:600;font-size:14.5px;border:0;
  border-radius:10px;background:var(--steel-100);color:var(--white);cursor:pointer}
.gl-actions button.gl-secondary{background:transparent;color:var(--steel-75);
  border:1px solid var(--rule-strong)}
.gl-actions button:hover{background:var(--orange-deep);color:var(--white)}
.gl-actions button:disabled{background:var(--steel-25);cursor:not-allowed}

.gl-receipt{margin-top:22px;padding:20px 22px;background:var(--white);border-radius:12px;
  border-left:3px solid var(--green)}
.gl-receipt h3{font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:var(--steel-50)}
.gl-receipt dl{margin:14px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:14px 22px}
.gl-receipt dt{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--steel-50);
  font-weight:600}
.gl-receipt dd{margin:3px 0 0;font-size:17px;font-weight:600}
.gl-receipt dd small{display:block;font-size:12px;font-weight:400;color:var(--steel-50);
  word-break:break-all}
.gl-receipt--warn{border-left-color:var(--orange)}

@media (max-width:720px){ .gl-maprow{grid-template-columns:1fr} }
`;

/**
 * The upload client.
 *
 * First-party, no dependency, no `eval`, no inline handler. Response values reach the DOM through
 * `textContent`; the only markup this builds is its own structure, never a string containing data.
 * That matters more here than anywhere: the values being rendered are column names and sample cells
 * from a file a stranger supplied.
 */
export const GL_UPLOAD_RUNTIME = `
(function () {
  'use strict';

  var root = document.getElementById('gl-upload');
  if (!root) return;

  var steps = document.getElementById('gl-steps');
  var drop = document.getElementById('gl-drop');
  var picker = document.getElementById('gl-file');
  var stage = document.getElementById('gl-stage');
  var note = document.getElementById('gl-upnote');

  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  var isLocalPage = window.location.protocol === 'http:'
    && LOCAL_HOSTS.indexOf(window.location.hostname) !== -1;
  var BASES = isLocalPage
    ? [window.location.origin + '/api', 'http://127.0.0.1:8080/api']
    : [window.location.origin + '/api'];

  var base = null;
  var token = null;
  var current = null;

  var STEP_NAMES = ['Select', 'Parse', 'Profile', 'Map', 'Validate', 'Preview', 'Confirm', 'Receipt'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function setStep(index) {
    if (!steps) return;
    var items = steps.children;
    for (var i = 0; i < items.length; i += 1) {
      items[i].setAttribute('data-state', i < index ? 'done' : i === index ? 'active' : 'todo');
    }
  }

  function disable(reason) {
    if (drop) {
      drop.setAttribute('aria-disabled', 'true');
      if (picker) picker.disabled = true;
    }
    if (note) { note.textContent = reason; note.className = 'gl-badge gl-badge--warn'; }
  }

  function connect(index) {
    if (index >= BASES.length) {
      disable('Adding knowledge requires the trusted runtime, which is not deployed here. '
        + 'Uploaded files are parsed on the server, never in the browser.');
      return Promise.resolve(false);
    }
    base = BASES[index];
    return fetch(base + '/health')
      .then(function (r) { if (!r.ok) throw new Error('unhealthy'); return r.json(); })
      .then(function () {
        return fetch(base + '/session', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ persona: 'exec.cdo' })
        }).then(function (r) { return r.json(); });
      })
      .then(function (payload) {
        token = payload && payload.data ? payload.data.token : null;
        if (!token) throw new Error('no session');
        if (note) { note.textContent = 'Connected to the trusted runtime'; note.className = 'gl-badge'; }
        if (picker) picker.disabled = false;
        return true;
      })
      .catch(function () { return connect(index + 1); });
  }

  function post(path, body) {
    return fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (payload) {
        if (!r.ok) throw new Error((payload && payload.detail) || 'The upload was refused.');
        return payload;
      });
    });
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }

  function failure(message) {
    stage.textContent = '';
    var box = el('div', 'gl-receipt gl-receipt--warn');
    box.appendChild(el('h3', null, 'The file was not ingested'));
    box.appendChild(el('p', null, message));
    stage.appendChild(box);
    setStep(1);
  }

  /* ---------------------------------------------------------------- mapping */

  function renderMapping(data) {
    stage.textContent = '';
    setStep(3);

    var head = el('div');
    head.appendChild(el('p', 'gl-eyebrow', 'Step 4 of 8 · confirm the mapping'));
    head.appendChild(el('h3', 'gl-h3', data.fileName));
    var summary = el('p', 'gl-note');
    summary.textContent = data.sheetName + ' · ' + data.rowsDetected + ' rows · '
      + data.headers.length + ' columns · fingerprint ' + String(data.fingerprint).slice(0, 16) + '…';
    head.appendChild(summary);
    var rule = el('p', 'gl-note');
    rule.style.marginTop = '10px';
    rule.textContent = 'A suggestion marked LIKELY is left unselected on purpose: accepting it should '
      + 'be something you did, not something you failed to undo. Columns left unmapped are read and '
      + 'ignored, and the receipt says so.';
    head.appendChild(rule);
    stage.appendChild(head);

    var identityWrap = el('div', 'gl-maprow');
    identityWrap.appendChild((function () {
      var d = el('div');
      d.appendChild(el('b', null, 'Which column identifies the project?'));
      d.appendChild(el('p', 'gl-why', 'Resolved through declared identity mappings only. An '
        + 'identifier nobody has mapped is quarantined, never matched by name similarity.'));
      return d;
    }()));
    /*
     * The structural columns are pre-selected from the profile, and then removed from the concept
     * list below.
     *
     * Offering the period column in both places was not merely untidy: a person mapped it to
     * \`financial.financialPeriod\` in the concept list while the period dropdown still read "none",
     * and every row quarantined as an invalid number. A control that can be answered twice will be.
     */
    var periodColumn = null;
    var identityColumn = null;
    data.suggestions.forEach(function (s, i) {
      if (s.concept === 'financial.financialPeriod' && periodColumn === null) {
        periodColumn = s.sourceField;
      }
      if (identityColumn === null && s.confidence === 'NONE'
        && /(^|[_\s-])(id|ref|reference|key|code|number)$/i.test(s.sourceField)) {
        identityColumn = s.sourceField;
      }
      void i;
    });
    if (identityColumn === null) identityColumn = data.headers[0];

    var identitySelect = el('select');
    identitySelect.id = 'gl-identity';
    data.headers.forEach(function (h) {
      var o = el('option', null, h);
      o.value = h;
      if (h === identityColumn) o.selected = true;
      identitySelect.appendChild(o);
    });
    identityWrap.appendChild(identitySelect);
    identityWrap.appendChild(el('span', 'gl-conf gl-conf--EXACT', 'required'));
    stage.appendChild(identityWrap);

    var periodWrap = el('div', 'gl-maprow');
    periodWrap.appendChild((function () {
      var d = el('div');
      d.appendChild(el('b', null, 'Which column holds the period?'));
      d.appendChild(el('p', 'gl-why', 'Optional. An ambiguous numeric date is rejected rather than '
        + 'guessed at — a period-shifted financial record reconciles against nothing.'));
      return d;
    }()));
    var periodSelect = el('select');
    periodSelect.id = 'gl-period';
    var none = el('option', null, '— none —');
    none.value = '';
    periodSelect.appendChild(none);
    data.headers.forEach(function (h) {
      var o = el('option', null, h);
      o.value = h;
      if (h === periodColumn) o.selected = true;
      periodSelect.appendChild(o);
    });
    periodWrap.appendChild(periodSelect);
    periodWrap.appendChild(el('span', 'gl-conf gl-conf--NONE', 'optional'));
    stage.appendChild(periodWrap);

    data.suggestions.forEach(function (s, index) {
      // The identity and period columns are handled above. Listing them again would let one column
      // be answered twice, with the two answers disagreeing.
      if (s.sourceField === identityColumn || s.sourceField === periodColumn) return;
      var row = el('div', 'gl-maprow');
      var left = el('div');
      left.appendChild(el('b', null, s.sourceField));
      var col = data.profile[index] || {};
      var detail = (col.inferredType || 'text') + ' · ' + (col.populated || 0) + ' populated · '
        + (col.blank || 0) + ' blank'
        + (col.samples && col.samples.length ? ' · e.g. ' + col.samples.slice(0, 2).join(', ') : '');
      left.appendChild(el('p', 'gl-why', detail));
      row.appendChild(left);

      var select = el('select');
      select.setAttribute('data-column', s.sourceField);
      var ignore = el('option', null, '— read and ignore —');
      ignore.value = '';
      select.appendChild(ignore);
      data.concepts.forEach(function (c) {
        var o = el('option', null, c);
        o.value = c;
        // EXACT is pre-selected; LIKELY deliberately is not.
        if (s.confidence === 'EXACT' && s.concept === c) o.selected = true;
        select.appendChild(o);
      });
      row.appendChild(select);
      row.appendChild(el('span', 'gl-conf gl-conf--' + s.confidence, s.confidence.toLowerCase()));
      stage.appendChild(row);
    });

    var actions = el('div', 'gl-actions');
    var confirm = el('button', null, 'Validate and preview');
    confirm.type = 'button';
    confirm.id = 'gl-confirm';
    var cancel = el('button', 'gl-secondary', 'Choose a different file');
    cancel.type = 'button';
    cancel.id = 'gl-cancel';
    actions.appendChild(confirm);
    actions.appendChild(cancel);
    stage.appendChild(actions);
  }

  /* ---------------------------------------------------------------- receipt */

  function renderReceipt(payload) {
    var receipt = payload.receipt;
    var verification = payload.verification;
    setStep(7);
    stage.textContent = '';

    var quarantinedAll = receipt.recordsAccepted === 0 && receipt.recordsDetected > 0;
    var box = el('div', 'gl-receipt' + (quarantinedAll ? ' gl-receipt--warn' : ''));
    box.appendChild(el('h3', null, 'Ingestion receipt'));
    box.appendChild(el('p', null, receipt.sourceName));

    var dl = el('dl');
    function pair(label, value, small) {
      dl.appendChild(el('dt', null, label));
      var dd = el('dd', null, value);
      if (small) dd.appendChild(el('small', null, small));
      dl.appendChild(dd);
    }
    pair('Rows detected', String(receipt.recordsDetected));
    pair('Accepted', String(receipt.recordsAccepted));
    pair('Quarantined', String(receipt.recordsQuarantined));
    pair('Projects matched', String(receipt.projectsMatched));
    pair('Unresolved', String(receipt.projectsUnresolved));
    pair('Fields mapped', String(receipt.fieldsMapped) + ' / ' + String(receipt.fieldsMapped + receipt.fieldsIgnored));
    pair('Authority', String(receipt.authority).toLowerCase().replace(/_/g, ' '));
    pair('Data context', String(receipt.dataContext));
    pair('Conflicts', String((payload.conflicts || []).length));
    pair('Fingerprint', String(receipt.fingerprint).slice(0, 12) + '…', receipt.fingerprint);
    pair('Mapping version', receipt.mappingVersion);
    pair('Verification', verification ? verification.verdict.toLowerCase().replace(/_/g, ' ') : '—');
    box.appendChild(dl);

    (receipt.notes || []).forEach(function (n) {
      var p = el('p', 'gl-note', n);
      p.style.marginTop = '12px';
      box.appendChild(p);
    });
    stage.appendChild(box);

    if (payload.quarantined && payload.quarantined.length) {
      var q = el('div');
      q.style.marginTop = '22px';
      q.appendChild(el('h3', 'gl-h3', 'Quarantined rows'));
      q.appendChild(el('p', 'gl-note', 'Inspectable, carrying the reason, and contributing to no '
        + 'answer. Nothing here reached a governed figure.'));
      var table = el('table', 'gl-srcgrid');
      var thead = el('thead');
      var hr = el('tr');
      ['Row', 'Identifier', 'Why it was rejected'].forEach(function (h) { hr.appendChild(el('th', null, h)); });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el('tbody');
      payload.quarantined.forEach(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', null, String(r.rowNumber)));
        tr.appendChild(el('td', null, r.naturalKey === '' ? '(blank)' : r.naturalKey));
        var reasons = el('td');
        (r.findings || []).forEach(function (f) {
          reasons.appendChild(el('div', null,
            String(f.code).toLowerCase().replace(/_/g, ' ') + ' — ' + f.detail));
        });
        tr.appendChild(reasons);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      var wrap = el('div');
      wrap.style.overflowX = 'auto';
      wrap.appendChild(table);
      q.appendChild(wrap);
      stage.appendChild(q);
    }

    var actions = el('div', 'gl-actions');
    var again = el('button', 'gl-secondary', 'Add another file');
    again.type = 'button';
    again.id = 'gl-cancel';
    actions.appendChild(again);
    stage.appendChild(actions);
  }

  /* ---------------------------------------------------------------- events */

  function chosen(file) {
    if (!file) return;
    setStep(1);
    stage.textContent = '';
    stage.appendChild(el('p', 'gl-note', 'Parsing ' + file.name + ' on the server…'));
    file.arrayBuffer().then(function (buffer) {
      return post('/ingest/profile', { fileName: file.name, contentBase64: toBase64(buffer) });
    }).then(function (payload) {
      current = payload.data;
      current.fileName = file.name;
      current.raw = null;
      return file.arrayBuffer();
    }).then(function (buffer) {
      current.contentBase64 = toBase64(buffer);
      setStep(2);
      renderMapping(current);
    }).catch(function (e) { failure(e.message); });
  }

  document.addEventListener('change', function (event) {
    if (event.target && event.target.id === 'gl-file') chosen(event.target.files[0]);
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.id) return;
    if (target.id === 'gl-cancel') {
      event.preventDefault();
      current = null;
      stage.textContent = '';
      if (picker) picker.value = '';
      setStep(0);
      return;
    }
    if (target.id !== 'gl-confirm' || !current) return;
    event.preventDefault();
    target.disabled = true;
    setStep(4);

    var fields = [];
    var selects = stage.querySelectorAll('select[data-column]');
    for (var i = 0; i < selects.length; i += 1) {
      if (selects[i].value) {
        fields.push({ sourceField: selects[i].getAttribute('data-column'), concept: selects[i].value });
      }
    }
    var identity = document.getElementById('gl-identity');
    var period = document.getElementById('gl-period');

    post('/ingest/structured', {
      fileName: current.fileName,
      sourceName: current.fileName,
      contentBase64: current.contentBase64,
      identityField: identity ? identity.value : '',
      periodField: period ? period.value : '',
      fields: fields
    }).then(function (payload) {
      renderReceipt(payload.data);
    }).catch(function (e) {
      failure(e.message);
      target.disabled = false;
    });
  });

  // Build the step rail once, from one list, so the labels and the states cannot disagree.
  if (steps) {
    STEP_NAMES.forEach(function (name) {
      var li = el('li', null, name);
      li.setAttribute('data-state', 'todo');
      steps.appendChild(li);
    });
    setStep(0);
  }
  if (picker) picker.disabled = true;
  connect(0);
}());
`;
