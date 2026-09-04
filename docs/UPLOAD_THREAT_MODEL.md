# Upload threat model

> **DEMO — SYNTHETIC DATA.** Nothing here is pointed at a production system. See `CLAUDE.md`.

Phase 13 gave this product a file picker. That single control changed its risk profile more than
every other change in the phase combined: before it, the runtime read only bytes this repository
generated; after it, the process that holds the API credential parses whatever a visitor chooses to
send. This document says what that process assumes, what it refuses, and — the part worth reading —
what it does **not** defend against.

---

## 1 · The decision this document exists to record

**The parsers run in the same process as the API credential and the governed engines.** They are not
sandboxed into a separate service, a worker with dropped privileges, or a WASM boundary.

That is a decision, not an oversight, and here is the reasoning.

The realistic alternative for a POC on Cloud Run is a second service that parses and returns
structured output. It buys real isolation from a parser memory-safety bug — and in this codebase the
parsers are TypeScript over `Uint8Array` with no native code, no `eval`, no dynamic `require`, and no
filesystem or network access of their own, so the class of bug it isolates against is *logic*
exhaustion rather than memory corruption. Against exhaustion, bounds are a more direct control than
isolation, and they are the same bounds either service would need. Meanwhile the second service adds
a second deployment, a second identity, a second network hop carrying the untrusted bytes, and a
second place for the trust boundary to be described incorrectly.

So the mitigation is **bounds, refusal, and no capability**, and the sandbox is explicitly deferred
rather than assumed. `ADR-0032` records the runtime shape this sits inside.

**What would change this decision:** any native dependency entering the parse path; any parser
gaining filesystem, network, or subprocess access; multi-tenant use with data that is not synthetic;
or a single measured case of a bounded parser exceeding its budget in wall-clock time.

---

## 2 · What reaches a parser, and what does not

```
browser ──TLS──▶ Firebase Hosting ──▶ Cloud Run ──▶ route ──▶ parser
                                            │
                            access code ────┤ 401 before any byte is read
                            rate limit  ────┤ 429 before any byte is read
                            body cap    ────┤ 413 during the read, not after
                            size cap    ────┤ 413 before any parser is called
                            format      ────┤ decided by bytes, never by filename
```

Every control above the parser is ordered so that the cheapest refusal happens first. An anonymous
caller costs one HMAC verification; a rate-limited caller costs a map lookup; an oversized upload is
abandoned mid-read rather than buffered and then rejected.

| Control | Value | Where |
| --- | --- | --- |
| Caller authentication | HMAC session token, 8-hour life | `server/access.ts` |
| Per-caller ingest limit | 10/minute | `server/main.ts` |
| Per-caller ask limit | 30/minute | `server/main.ts` |
| Request body ceiling | 256 KiB normal, 12 MiB upload routes | `server/runtime.ts` |
| Decoded upload ceiling | 8 MiB | `server/main.ts` |
| Instance ceiling | 3 | Cloud Run `--max-instances` |
| Request timeout | 60 s | Cloud Run |
| Monthly spend ceiling | $25, alerting at 50 / 90 / 100 % | Cloud Billing budget |

---

## 3 · The parsers, attack class by attack class

Every row below has a test in `tests/unit/platform/parse-adversarial.test.ts`. A row without one
would be a claim rather than a control.

### ZIP (`src/platform/parse/zip.ts`)

| Attack | Response |
| --- | --- |
| Zip bomb | Output cap passed **into** zlib, so inflation aborts during expansion, not after allocation. Declared uncompressed size checked before any inflate. |
| Entry-count exhaustion | 512-entry ceiling, checked against the directory's own declaration before it is walked. |
| Path traversal (`../`, `/etc`, `C:\`) | Refused outright. Nothing is written to disk; an archive containing one is treated as evidence of hostility, not as something to sanitise. |
| Encrypted member | Refused. The alternative is handing ciphertext to an XML reader. |
| Unsupported compression method | Refused. Only stored and deflate exist. |
| Quadratic EOCD scan | The backward signature scan is windowed to 64 KiB. |

### XLSX (`src/platform/parse/xlsx.ts`)

| Attack | Response |
| --- | --- |
| XXE / external entity | **Structurally unavailable.** XML is read by a scanner that knows five named entities and treats everything else — including the `<!DOCTYPE>` that declares one — as literal text. There is no resolver to disable. |
| Formula execution | Never. Only cached values are read; a formula with no cached value is reported as `uncachedFormula` and becomes a validation finding rather than a number. |
| Billion laughs | Same as XXE: no entity is expanded, so no expansion is recursive. |
| Cell/row/column exhaustion | 20,000 rows, 256 columns, 4,000 characters per cell, and the row count that was cut is reported. |

### CSV (`src/platform/parse/tabular.ts`)

| Attack | Response |
| --- | --- |
| Formula injection (`=`, `+`, `-`, `@`, tab, CR) | Prefixed with `'` and recorded in `formulaLike`. The value is kept, because losing it would defeat the point of ingesting evidence. |
| Numeric-looking payload (`+1+cmd\|'/c calc'!A1`) | Neutralised. **This was a real gap**: the exemption for signed numbers tested whether a value *began* like one. It now requires the whole value to be digits and separators. |
| Unterminated quote | Terminates rather than consuming the remainder of the file as one cell. |

### PDF (`src/platform/parse/pdf.ts`)

| Attack | Response |
| --- | --- |
| Cyclic page tree | Depth limit and a visited set; a self-referencing `/Kids` terminates. |
| Decompression bomb in a content stream | Per-stream input and output ceilings. |
| Object-count exhaustion | 20,000 objects, 400 pages, 60,000 characters per page. |
| Partial read presented as complete | `PARSE_INCOMPLETE` with the unreadable parts named. **The most consequential control here**: a page that failed to decompress and a page that was blank produce identical text, and an assistant that cannot tell them apart will answer "the contract says nothing about acceptance" when the truth is "I could not read the page acceptance is on". |
| JavaScript, embedded files, launch actions | Never interpreted. The reader extracts `Tj`/`TJ` text operators; it does not implement actions. |

### Format confusion

`detectFormat` reads magic bytes. A PDF named `.xlsx` is read as a PDF or refused; the filename never
selects a parser, and the filename never becomes a storage key either — retained objects are
addressed `sourceId/versionId`.

---

## 4 · What this does not defend against

Stated plainly, because a threat model that lists only its successes is marketing.

- **A distributed attacker.** The rate limit is in-process. With three instances a determined caller
  gets three times the limit. The real ceiling is `--max-instances` and the billing budget.
- **An authorised caller uploading nonsense.** By design: the answer to bad data is quarantine and
  disclosure, not rejection at the door. Every uploaded row lands in `SANDBOX` and no code path
  promotes it further, so nothing anyone uploads can move an executive figure.
- **The access code being shared.** It is a shared demo credential, not an identity. Anyone holding
  it is `exec.cdo` if they choose to be. This is why the deployment carries synthetic data only, and
  why §5 below is the condition for that changing.
- **A parser bug nobody has found.** Bounds contain the blast radius of an exhaustion bug. They do
  not contain a logic bug that returns wrong text, and the answer to that is the citation model: an
  answer names the document and page it came from, so a reader can check it.
- **Malware in an uploaded file.** Nothing here scans for it. Uploaded bytes are stored and never
  executed, never served back to a browser, and never written to a path derived from user input —
  but a file that is malicious to some *other* system would be retained intact.

---

## 5 · Before this could take a real GlobalLogic file

Not a roadmap — a list of conditions, each of which is currently false.

1. Real identity, not a shared code: SSO with per-user identity and group-derived scope.
2. Parser isolation, per §1's trigger list, once the data stops being synthetic.
3. Malware scanning on retained objects before anything is stored.
4. Per-tenant storage isolation and a retention policy with an actual deletion path.
5. A reviewed data-processing agreement covering whatever the uploaded material contains.

`docs/REAL_GL_CONNECTOR_ONBOARDING.md` covers the equivalent conditions for a connector.
