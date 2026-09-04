# Onboarding a real GlobalLogic source

> **DEMO — SYNTHETIC DATA.** No connector in this repository is pointed at a GlobalLogic system, and
> none may be without the conditions in §4 being met first. See `CLAUDE.md`.

This is what someone at GlobalLogic would actually have to do to replace a synthetic fixture with a
real system — written so that the honest answer to *"how long until this reads our real Finance
data?"* is a list rather than a shrug.

---

## 1 · What is already true

The six fixtures in `scripts/fixtures/enterprise.ts` are adapters that satisfy the whole
`EnterpriseConnector` contract and return synthetic records. **Every one is labelled `FIXTURE`, and
`CONNECTED` is not a value the status vocabulary contains** — the closest thing to it,
`REAL_VERIFIED`, can only be produced by a `healthCheck` that actually succeeded against an endpoint.

Adding a source is writing one class. `tests/integration/connector-extensibility.test.ts` proves it
by defining a connector for a system that appears nowhere in the product, registering it, and then
grepping `src/`, `server/` and `scripts/` to show that nothing knows its name. If a future change
adds a special case for a particular system, that test fails.

---

## 2 · The five things nobody outside GlobalLogic can supply

These are why no connector here is real, and no amount of engineering closes them.

1. **The tenant's actual schema.** Which object holds actual cost, what the field is called, what its
   nullability and units are. Generic knowledge that Salesforce has an `Opportunity` object is not
   evidence about GlobalLogic's org, and `discoverSchema()` returns
   `discoveredFromLiveSystem: false` on every fixture for exactly that reason.
2. **A read-only service account** and the authentication method the platform team actually uses.
3. **Network reachability** — allow-listing, VPC-SC, IP ranges, or a reverse proxy.
4. **The identity mapping.** Which finance identifier corresponds to which delivery project. This is
   the one that cannot be inferred: `ProjectIdentityHub` has no similarity function, by decision, and
   a record whose identifier is not declared is quarantined rather than joined by name.
5. **A data-protection decision** about what may be read, retained, and shown to whom.

---

## 3 · The steps, in order

### Step 1 — Write the adapter

One file, implementing `EnterpriseConnector`. Nothing above it changes.

```ts
class FinanceErpConnector implements EnterpriseConnector {
  readonly provenance = {
    sourceId: 'src-finance-erp',
    system: 'FINANCE_ERP',
    domain: 'FINANCE_ERP',
    displayName: 'Finance ERP',
    isFixture: false,      // and it had better not be
    fixtureNotice: null,
  };
  readonly suppliesConcepts = ['financial.actualCost', 'financial.forecastRevenue'] as const;
  // healthCheck, discoverSchema, preview, mapSchema, sync, getChanges, getLastSync,
  // getProvenance, getAuthorityMetadata
}
```

Outbound HTTP goes through `@platform/net` and nowhere else: it is the single egress point, with a
host allow-list, TLS enforcement, a timeout, a response-size cap, and `redirect: 'error'`. Add the
host to the adapter's `HostPolicy`. A connector that reaches for `fetch` directly fails the
architecture gate.

**There is no write method to implement.** Write-back is not a permission withheld; it is an
operation that does not exist in the interface.

### Step 2 — Discover the schema, and do not guess it

`discoverSchema()` must return what the endpoint actually reported, with
`discoveredFromLiveSystem: true`. Until then the row in
`docs/ENTERPRISE_INTEGRATION_MATRIX.md` reads `SCHEMA DISCOVERED: NO`, and that is correct.

### Step 3 — Have a person confirm the mapping

`suggestMappings` proposes; it never approves. A suggested mapping is rendered with its confidence
and a person confirms it, because a wrong mapping is invisible afterwards — the rows all load, the
counts all look right, and a cost column has quietly become an estimate.

### Step 4 — Declare the identity mapping

Every external identifier that should resolve to a project must be declared in
`ProjectIdentityHub`. Unmapped records quarantine, visibly, with a count. That is the intended
behaviour, not a gap: a POC that guessed the join would produce a portfolio that is wrong in a way
nobody can see.

### Step 5 — Grant authority, per concept

Authority is granted **per canonical concept, not per system** (ADR-0035 §3). Finance may be
`AUTHORITATIVE` for `financial.actualCost` and `EVIDENCE_ONLY` for a delivery date. The connector's
`getAuthorityMetadata()` *proposes*; the registry grants. A source that could assert its own
authority could promote itself above Finance by sending one field.

### Step 6 — Sync, and watch the drift

Idempotency is source system + natural key + source version (ADR-0008 §3), so re-running a sync
produces `recordsNew: 0`. Schema drift **stops ingestion** and never triggers an automatic remap:
an automatic remap is how a column rename silently starts feeding "actual cost" from a column that
now holds something else, and the resulting number looks entirely normal.

### Step 7 — Reconcile before anybody believes it

The conflict engine will now have two sources speaking about the same concept. It never merges,
never averages, never takes the newest. Expect real disagreements, and treat the register as the
first deliverable rather than as a defect list.

---

## 4 · Conditions that must be true before any of this runs against production

Currently **all false**, and none of them is an engineering task this repository can complete.

- [ ] A named data owner has approved the read, for named concepts.
- [ ] A read-only service account exists, with credentials in Secret Manager and never in an
      environment variable, a file, or this repository.
- [ ] Real identity, not a shared demo access code — SSO with per-user identity and group-derived
      scope. Until then anyone with the code is whichever persona they choose.
- [ ] The `DEMO — SYNTHETIC DATA` labelling is removed *deliberately*, in a change that also removes
      the synthetic portfolio — the two must never coexist, or a reader cannot tell which figures
      are which.
- [ ] Parser isolation, per `docs/UPLOAD_THREAT_MODEL.md` §1, if uploads are also enabled.
- [ ] A retention and deletion policy with an actual deletion path.

---

## 5 · What will not change, whatever is connected

Not aspirations — properties enforced by types and gates, which is why they are worth stating here.

- **No write, ever.** Not a policy; an absent method.
- **Nothing an upload or a connector supplies reaches an executive figure.** Ingested records enter
  `SANDBOX`, and no code path promotes past `APPROVED`.
- **No model is the calculator.** Every figure comes from a governed engine; the model reuses figures
  it is given and its output is checked against them before anyone sees it.
- **Authority is per concept and granted, never claimed.**
- **Identity is declared, never inferred.**
