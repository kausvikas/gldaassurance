#!/usr/bin/env node
/**
 * Static schema-boundary gate — closes debt DR-007 as far as it can be closed without a database.
 *
 * ADR-0001 §Decision 3: "Each context owns its schema namespace. **No cross-context foreign keys
 * and no cross-context joins.** Contexts reference each other by identifier and cross a published
 * contract."
 *
 * A cross-schema foreign key is how a modular monolith quietly becomes an unsplittable one: the
 * database enforces a coupling the code has agreed not to have, and the first extraction attempt
 * discovers it. This parses the migration DDL and fails on any FK whose target schema differs from
 * the table's own.
 *
 * It also checks two things the DDL should always be true about:
 *   - every monetary column is accompanied by a currency column (REQ-DATA-006);
 *   - every insert-once table carries both immutability controls (ADR-0007 §Decision 3).
 *
 * This is a *static* check over SQL text. It is weaker than running the queries in
 * `migrations/README.md` against a real database, and that difference is recorded as DR-012.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '..', '..', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

const violations = [];

/** Tables that must carry both a revoked privilege and a rejecting trigger. */
const INSERT_ONCE = [
  'contract.as_sold_baseline',
  'contract.executed_change',
  'contract.baseline_revision',
  'project.project_snapshot',
  'financial.fx_rate',
  'financial.financial_snapshot',
  'delivery.delivery_snapshot',
  'health.rag_override',
  'health.health_assessment',
  'audit.audit_event',
  'assurance.evidence_record',
  'rules.metric_version',
  'organization.hierarchy_snapshot',
  'financial.recognised_revenue_fact',
];

/** Comments are prose; they must not be scanned for SQL types. */
const stripComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

const all = files.map((f) => {
  const sql = readFileSync(join(DIR, f), 'utf8');
  return { file: f, sql, code: stripComments(sql) };
});
const combined = all.map((a) => a.code).join('\n');

// --- 1. No foreign key crosses a schema boundary ----------------------------
for (const { file, code: sql } of all) {
  const tableRe = /CREATE TABLE\s+([a-z_]+)\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = tableRe.exec(sql)) !== null) {
    const [, schema, table, body] = m;
    const refRe = /REFERENCES\s+([a-z_]+)\.([a-z_]+)/g;
    let r;
    while ((r = refRe.exec(body)) !== null) {
      if (r[1] !== schema) {
        violations.push({
          code: 'CROSS_SCHEMA_FK', file,
          detail: `${schema}.${table} references ${r[1]}.${r[2]}. Contexts reference each other by opaque identifier, never by foreign key (ADR-0001 §Decision 3).`,
        });
      }
    }
  }
}

// --- 2. Every money column has a currency beside it -------------------------
for (const { file, code: sql } of all) {
  const tableRe = /CREATE TABLE\s+([a-z_]+)\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = tableRe.exec(sql)) !== null) {
    const [, schema, table, body] = m;
    const hasMoney = /financial\.money_amount/.test(body);
    const hasCurrency = /currency_code|reporting_currency/.test(body);
    // Snapshot tables declare one reporting currency for the whole row; that counts.
    if (hasMoney && !hasCurrency) {
      violations.push({
        code: 'MONEY_WITHOUT_CURRENCY', file,
        detail: `${schema}.${table} stores a money amount with no currency column (REQ-DATA-006, ADR-0002 §Decision 6).`,
      });
    }
  }
}

// --- 3. Insert-once tables carry both controls ------------------------------
for (const table of INSERT_ONCE) {
  const [schema, name] = table.split('.');
  const hasRevoke = new RegExp(`REVOKE\\s+UPDATE,\\s*DELETE\\s+ON\\s+${schema}\\.${name}\\b`, 'i').test(combined);
  const hasTrigger = new RegExp(`CREATE TRIGGER[\\s\\S]{0,200}?ON\\s+${schema}\\.${name}\\b[\\s\\S]{0,120}?reject_mutation`, 'i').test(combined);
  if (!hasRevoke) {
    violations.push({ code: 'MISSING_REVOKE', file: 'migrations/', detail: `${table} has no REVOKE UPDATE, DELETE (control 1 of 2, ADR-0007 §Decision 3).` });
  }
  if (!hasTrigger) {
    violations.push({ code: 'MISSING_TRIGGER', file: 'migrations/', detail: `${table} has no rejecting trigger (control 2 of 2, ADR-0007 §Decision 3).` });
  }
}

// --- 4. No FLOAT/REAL/DOUBLE anywhere ---------------------------------------
for (const { file, code } of all) {
  const bad = code.match(/\b(FLOAT|REAL|DOUBLE PRECISION)\b/g);
  if (bad) {
    violations.push({ code: 'FLOATING_POINT', file, detail: `Found ${bad.join(', ')}. Money and rates are NUMERIC (ADR-0002 §Decision 1).` });
  }
}

console.log(`schema gate: ${files.length} migration files, ${INSERT_ONCE.length} insert-once tables checked`);
if (violations.length === 0) {
  console.log('PASS — no cross-schema foreign keys, no float columns, immutability controls present.');
  process.exit(0);
}
for (const v of violations) console.error(`  ${v.code}  ${v.file}\n    ${v.detail}`);
console.error(`\nFAIL — ${violations.length} schema violation(s).`);
process.exit(1);
