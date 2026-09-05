#!/usr/bin/env node
/**
 * DR-012 — PostgreSQL execution verification.
 *
 * Runs the authored migration chain against a **real** PostgreSQL instance from an empty database,
 * then exercises the controls the migrations claim to install. `scripts/ci/check-schema-boundaries.mjs`
 * parses SQL *text*; this executes it. The difference is the whole of DR-012.
 *
 * Usage:  npm run db:verify
 *
 * Transport is `docker exec` into a disposable container by default, or `psql` directly if
 * `GLDI_PG_PSQL=1`. Nothing here is a production deployment mechanism; it is a test harness.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CONTAINER = process.env['GLDI_PG_CONTAINER'] ?? 'gldi-pg-verify';
const DB = process.env['GLDI_PG_DB'] ?? 'gldi_verify';
const IMAGE = process.env['GLDI_PG_IMAGE'] ?? 'postgres:16-alpine';
const MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations');

/**
 * Direct `psql`, for an instance somebody else is running.
 *
 * The header has promised this mode since the file was written and the code never had it: every
 * path went through `docker exec`. That is why the CI step could not pass — a GitHub runner is
 * perfectly capable of providing PostgreSQL as a service, and this script could only ever talk to a
 * container it had started itself. A documented capability with no implementation is the same defect
 * class as a documented pipeline stage nobody calls.
 */
const DIRECT = (process.env['GLDI_PG_PSQL'] ?? '') !== '';
const HOST = process.env['GLDI_PG_HOST'] ?? '127.0.0.1';
const PORT = process.env['GLDI_PG_PORT'] ?? '5432';
const USER = process.env['GLDI_PG_USER'] ?? 'postgres';

// --- transport --------------------------------------------------------------
function psql(sql, { db = DB, tuplesOnly = true } = {}) {
  // `-q` suppresses command tags (INSERT 0 1, DO, SET), so a multi-statement check returns only the
  // value the final SELECT produced. Without it every assertion has to strip status noise.
  const flags = ['-q', '-v', 'ON_ERROR_STOP=1', ...(tuplesOnly ? ['-tA'] : []), '-f', '-'];
  if (DIRECT) {
    return execFileSync(
      'psql', ['-h', HOST, '-p', PORT, '-U', USER, '-d', db, ...flags],
      { input: sql, encoding: 'utf8', env: process.env },
    );
  }
  return execFileSync(
    'docker', ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', db, ...flags],
    { input: sql, encoding: 'utf8' },
  );
}

function ensureContainer() {
  if (DIRECT) {
    // Somebody else owns the server. Prove it answers before running 80 assertions against it, so a
    // connection problem reports as a connection problem rather than as eighty failed checks.
    for (let i = 0; i < 60; i += 1) {
      try {
        execFileSync('pg_isready', ['-h', HOST, '-p', PORT, '-U', USER], { stdio: 'ignore' });
        return;
      } catch {
        execSync('sleep 1', { shell: '/bin/sh' });
      }
    }
    console.error(`FATAL: no PostgreSQL answering at ${HOST}:${PORT} after 60s.`);
    process.exit(2);
  }

  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    console.error('FATAL: no Docker daemon. DR-012 requires a real PostgreSQL runtime.');
    console.error('Start Docker, or set GLDI_PG_PSQL=1 and point GLDI_PG_HOST/PORT at an instance.');
    process.exit(2);
  }
  const running = execSync(`docker ps -q -f name=^${CONTAINER}$`, { encoding: 'utf8' }).trim();
  if (!running) {
    console.log(`starting disposable PostgreSQL container "${CONTAINER}" (${IMAGE})…`);
    execSync(`docker rm -f ${CONTAINER} >/dev/null 2>&1 || true`, { shell: '/bin/sh' });
    execSync(
      `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=verify -p 55432:5432 ${IMAGE} >/dev/null`,
      { shell: '/bin/sh' },
    );
    for (let i = 0; i < 60; i += 1) {
      try {
        execSync(`docker exec ${CONTAINER} pg_isready -U postgres`, { stdio: 'ignore' });
        break;
      } catch {
        execSync('sleep 1', { shell: '/bin/sh' });
      }
    }
  }
}

// --- assertions -------------------------------------------------------------
const results = [];
let currentGroup = '';

const group = (name) => { currentGroup = name; };

/** Expect the SQL to succeed, and optionally to return a particular single value. */
function ok(name, sql, expected) {
  try {
    // The value under test is what the last statement returned.
    const lines = psql(sql).trim().split('\n').filter((l) => l.trim() !== '');
    const out = (lines[lines.length - 1] ?? '').trim();
    if (expected !== undefined && out !== String(expected)) {
      results.push({ group: currentGroup, name, pass: false, detail: `expected "${expected}", got "${out}"` });
      return;
    }
    results.push({ group: currentGroup, name, pass: true, detail: expected !== undefined ? String(out) : 'ok' });
  } catch (e) {
    const msg = (e.stderr?.toString() ?? e.message ?? '').split('\n').filter(Boolean)[0] ?? 'error';
    results.push({ group: currentGroup, name, pass: false, detail: `unexpected failure: ${msg}` });
  }
}

/** Expect PostgreSQL itself to reject the statement, with a message matching `match`. */
function rejects(name, sql, match) {
  try {
    psql(sql);
    results.push({ group: currentGroup, name, pass: false, detail: 'statement was ACCEPTED but should have been rejected' });
  } catch (e) {
    // psql prefixes errors with its own location, e.g. `psql:<stdin>:2: ERROR: …`.
    const msg = (e.stderr?.toString() ?? '').split('\n').find((l) => l.includes('ERROR:')) ?? '';
    if (match && !new RegExp(match, 'i').test(msg)) {
      results.push({ group: currentGroup, name, pass: false, detail: `rejected, but not as expected: ${msg}` });
      return;
    }
    results.push({ group: currentGroup, name, pass: true, detail: msg.replace(/^.*ERROR:\s*/, '').slice(0, 96) });
  }
}

// --- fixtures ---------------------------------------------------------------
const FIXTURE = `
INSERT INTO organization.fiscal_calendar VALUES ('cal-1','Calendar year',1,'FY','START_YEAR');
INSERT INTO organization.node VALUES ('bu-1','BUSINESS_UNIT','Americas',NULL,'cal-1',TRUE);
INSERT INTO organization.industry VALUES ('tech','Technology');
INSERT INTO organization.region VALUES ('NA','North America','bu-1');
INSERT INTO organization.customer VALUES ('cus-1','Meridian Automotive','tech','NA',TRUE);
INSERT INTO organization.account VALUES ('acc-1','cus-1','bu-1','Meridian Account',TRUE);
INSERT INTO portfolio.portfolio VALUES ('pf-1','Americas Portfolio','bu-1',TRUE);
INSERT INTO project.project VALUES
  ('prj-1','Meridian Platform R2','acc-1','bu-1','pf-1','ctr-1','FIXED_BID','EXECUTING',
   'MID_PROJECT','2025-06-02','2027-01-29',FALSE,TRUE);
INSERT INTO contract.contract VALUES
  ('ctr-1','prj-1','cus-1','FIXED_BID','2025-06-01','2025-06-02','2027-01-29',
   NULL,NULL,NULL,30,TRUE);
INSERT INTO contract.as_sold_baseline VALUES
  ('ctr-1','2025-06-01',10000000.0000,7600000.0000,400000.0000,'USD','2027-01-29',
   0.333300,78.5000,0.0500,96800.00,TRUE);
`;

// ---------------------------------------------------------------------------
function run() {
  ensureContainer();

  // --- Step 2: migrations from zero ----------------------------------------
  group('2. Migration chain from an empty database');
  psql(`DROP DATABASE IF EXISTS ${DB};`, { db: 'postgres' });
  psql(`CREATE DATABASE ${DB};`, { db: 'postgres' });

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      psql(readFileSync(join(MIGRATIONS, f), 'utf8'));
      results.push({ group: currentGroup, name: f, pass: true, detail: 'executed' });
    } catch (e) {
      const msg = (e.stderr?.toString() ?? '').split('\n').find((l) => l.includes('ERROR:')) ?? e.message;
      results.push({ group: currentGroup, name: f, pass: false, detail: msg });
      report();
      process.exit(1);
    }
  }
  ok('19 bounded-context schemas exist',
    `SELECT count(*) FROM information_schema.schemata WHERE schema_name IN
     ('identity','organization','portfolio','project','contract','financial','delivery','commercial',
      'quality','resource','risk','assurance','recovery','health','forecast','rules','data_quality',
      'integration','audit');`, 19);
  ok('56 tables created', `SELECT count(*) FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog','information_schema');`, 56);
  ok('money/rate/ratio/currency domains created',
    `SELECT count(*) FROM information_schema.domains WHERE domain_schema='financial';`, 4);
  ok('reject_mutation guard function exists',
    `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='audit' AND p.proname='reject_mutation';`, 1);
  ok('28 immutability triggers installed',
    `SELECT count(*) FROM information_schema.triggers
     WHERE trigger_schema NOT IN ('pg_catalog','information_schema');`, 28);

  psql(FIXTURE);

  // --- Step 3: As-Sold immutability ----------------------------------------
  group('3. As-Sold baseline immutability');
  ok('a valid As-Sold baseline exists',
    `SELECT contract_value::text FROM contract.as_sold_baseline WHERE contract_id='ctr-1';`, '10000000.0000');
  rejects('UPDATE contract_value is rejected',
    `UPDATE contract.as_sold_baseline SET contract_value=11000000 WHERE contract_id='ctr-1';`, 'insert-once');
  rejects('UPDATE budgeted_cost is rejected',
    `UPDATE contract.as_sold_baseline SET budgeted_cost=1 WHERE contract_id='ctr-1';`, 'insert-once');
  rejects('DELETE of the As-Sold baseline is rejected',
    `DELETE FROM contract.as_sold_baseline WHERE contract_id='ctr-1';`, 'insert-once');
  ok('the baseline is unchanged after the attempts',
    `SELECT contract_value::text FROM contract.as_sold_baseline WHERE contract_id='ctr-1';`, '10000000.0000');

  // The approved model must remain possible.
  ok('an executed contractual amendment can be appended',
    `INSERT INTO contract.executed_change VALUES
      ('crx-1','ctr-1','2026-03-15',500000.0000,420000.0000,15000.0000,'USD',NULL,0,NULL,TRUE);
     SELECT count(*)::text FROM contract.executed_change;`, '1');
  rejects('UPDATE of an executed change is rejected',
    `UPDATE contract.executed_change SET value_delta=999 WHERE id='crx-1';`, 'insert-once');
  ok('a forecast baseline revision can be appended',
    `INSERT INTO contract.baseline_revision VALUES
      ('rev-1','ctr-1','FORECAST','2026-03-15T09:00:00Z','2027-03-01',8200000.0000,'USD',
       'usr-dm','Re-forecast after CR execution',NULL,TRUE);
     SELECT count(*)::text FROM contract.baseline_revision;`, '1');
  rejects('UPDATE of a delivery/forecast baseline revision is rejected',
    `UPDATE contract.baseline_revision SET forecast_cost=1 WHERE id='rev-1';`, 'insert-once');
  ok('the Current Forecast remains separately revisable by appending',
    `INSERT INTO contract.baseline_revision VALUES
      ('rev-2','ctr-1','FORECAST','2026-06-01T09:00:00Z','2027-04-01',8400000.0000,'USD',
       'usr-dm','Second re-forecast','rev-1',TRUE);
     SELECT count(*)::text FROM contract.baseline_revision;`, '2');

  // --- Step 4: privilege controls ------------------------------------------
  group('4. Privilege controls (as authored)');
  ok('gldi_app exists, cannot log in, is not superuser',
    `SELECT rolcanlogin::text||'/'||rolsuper::text FROM pg_roles WHERE rolname='gldi_app';`, 'false/false');
  ok('gldi_app can SELECT the As-Sold baseline',
    `SET ROLE gldi_app; SELECT count(*)::text FROM contract.as_sold_baseline;`, '1');
  ok('gldi_app can INSERT an audit event',
    `SET ROLE gldi_app;
     INSERT INTO audit.audit_event VALUES
      ('aud-1','2026-08-31T09:00:00Z','usr-1','EXECUTIVE',NULL,'READ','Project','prj-1',
       '{margin}','GRANT',NULL,'corr-1',NULL,'10.0.0.1','test');
     SELECT count(*)::text FROM audit.audit_event;`, '1');
  rejects('gldi_app is denied UPDATE on the As-Sold baseline (privilege, not trigger)',
    `SET ROLE gldi_app; UPDATE contract.as_sold_baseline SET contract_value=1 WHERE contract_id='ctr-1';`,
    'permission denied');
  rejects('gldi_app is denied DELETE on the As-Sold baseline',
    `SET ROLE gldi_app; DELETE FROM contract.as_sold_baseline WHERE contract_id='ctr-1';`,
    'permission denied');
  rejects('gldi_app is denied UPDATE on the audit log',
    `SET ROLE gldi_app; UPDATE audit.audit_event SET action='WRITE' WHERE id='aud-1';`,
    'permission denied');
  rejects('gldi_app is denied DELETE on the audit log',
    `SET ROLE gldi_app; DELETE FROM audit.audit_event WHERE id='aud-1';`, 'permission denied');
  ok('only the two authored tables carry gldi_app grants',
    `SELECT count(DISTINCT table_schema||'.'||table_name)::text
     FROM information_schema.role_table_grants WHERE grantee='gldi_app';`, '2');

  // --- Step 5: monetary precision ------------------------------------------
  group('5. Monetary precision');
  ok('no REAL/FLOAT/DOUBLE column anywhere',
    `SELECT count(*) FROM information_schema.columns
     WHERE table_schema NOT IN ('pg_catalog','information_schema')
       AND data_type IN ('real','double precision');`, 0);
  ok('every money_amount column is NUMERIC(18,4)',
    `SELECT DISTINCT numeric_precision||','||numeric_scale FROM information_schema.columns
     WHERE domain_name='money_amount';`, '18,4');
  ok('0.1 + 0.2 = 0.3 exactly in the money domain',
    `SELECT (0.1::financial.money_amount + 0.2::financial.money_amount = 0.3::financial.money_amount)::text;`, 'true');
  ok('the float equivalent does NOT hold, which is why the domain exists',
    `SELECT (0.1::double precision + 0.2::double precision = 0.3::double precision)::text;`, 'false');
  ok('a large monetary value round-trips exactly',
    `INSERT INTO financial.actual_cost VALUES
      ('cst-1','prj-1','2026-08-31','LABOUR',28000000.0001,'USD','2026-08-31T09:00:00Z',TRUE);
     SELECT amount::text FROM financial.actual_cost WHERE id='cst-1';`, '28000000.0001');
  ok('a 1000-row sum of 0.01 is exactly 10.00, with no drift',
    `SELECT (SELECT sum(0.01::financial.money_amount) FROM generate_series(1,1000))::text;`, '10.0000');
  ok('a negative amount is stored where the design allows one',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-neg','prj-1','2026-01','ORIGINAL',-1500.0000,0.0000,'USD',NULL,NULL,
       'GL-NEG','1','RECOGNITION-v1','GL-NEG','2026-02-01T09:00:00Z','2026-02-02T09:00:00Z',TRUE);
     SELECT period_amount::text FROM financial.recognised_revenue_fact WHERE id='rrf-neg';`, '-1500.0000');
  ok('scale boundary: a 5th decimal is rounded to the declared scale of 4',
    `SELECT (12345.67891::financial.money_amount)::text;`, '12345.6789');
  rejects('a value beyond the declared precision is rejected, not silently truncated',
    `SELECT (123456789012345.6789::financial.money_amount);`, 'overflow|out of range');
  ok('rate and ratio domains carry their own declared scale',
    `SELECT (SELECT numeric_scale::text FROM information_schema.domains WHERE domain_name='rate_amount')
          ||'/'||
            (SELECT numeric_scale::text FROM information_schema.domains WHERE domain_name='ratio');`, '6/6');

  // --- Step 6: authored constraints ----------------------------------------
  group('6. Authored CHECK / UNIQUE / temporal constraints');
  ok('120 CHECK constraints installed',
    `SELECT count(*) FROM pg_constraint WHERE contype='c'
       AND connamespace::regnamespace::text NOT IN ('pg_catalog','information_schema');`, 120);
  rejects('a risk probability above 1 is rejected',
    `INSERT INTO risk.risk VALUES ('rsk-x','prj-1','d','HIGH',1.5,1000,'USD',FALSE,NULL,
      '2026-09-01','OPEN','2026-01-01','2026-08-31T09:00:00Z',TRUE);`, 'probability_check|violates check');
  rejects('a physical completion above 1 is rejected',
    `INSERT INTO delivery.progress_claim VALUES ('prj-1','2026-08-31',1.5,'basis','usr',TRUE);`,
    'violates check');
  rejects('a project ending before it starts is rejected',
    `INSERT INTO project.project VALUES ('prj-bad','x','acc-1','bu-1','pf-1','ctr-1','FIXED_BID',
      'EXECUTING','MID_PROJECT','2026-01-01','2025-01-01',FALSE,TRUE);`, 'violates check');
  rejects('a RAG override expiring before it was applied is rejected',
    `INSERT INTO health.rag_override VALUES ('prj-1','2026-08-31T09:00:00Z','AMBER','reason','usr',
      '2026-08-01T09:00:00Z',TRUE);`, 'violates check');
  rejects('a RAG override with an empty reason is rejected',
    `INSERT INTO health.rag_override VALUES ('prj-1','2026-08-31T09:00:00Z','AMBER','   ','usr',
      '2026-10-01T09:00:00Z',TRUE);`, 'violates check');
  rejects('an unsupported currency code is rejected',
    `INSERT INTO financial.actual_cost VALUES ('cst-bad','prj-1','2026-08-31','LABOUR',1,'XYZ',
      '2026-08-31T09:00:00Z',TRUE);`, 'violates check|value for domain');
  rejects('a risk flagged includedInEtc with no justification is rejected',
    `INSERT INTO risk.risk VALUES ('rsk-y','prj-1','d','HIGH',0.5,1000,'USD',TRUE,NULL,
      '2026-09-01','OPEN','2026-01-01','2026-08-31T09:00:00Z',TRUE);`, 'violates check');
  rejects('a synthetic=false row is rejected — real data is unstorable',
    `INSERT INTO organization.industry VALUES ('x','X');
     INSERT INTO organization.customer VALUES ('cus-real','X','x','NA',FALSE);`, 'violates check');
  ok('a valid weekly snapshot is accepted',
    `INSERT INTO project.project_snapshot VALUES ('prj-1','2026-W35',0,'2026-08-24T09:00:00Z',
      'EXECUTING',NULL,NULL,TRUE);
     SELECT count(*)::text FROM project.project_snapshot;`, '1');
  rejects('a duplicate (project, week, correction_seq) is rejected',
    `INSERT INTO project.project_snapshot VALUES ('prj-1','2026-W35',0,'2026-08-24T09:00:00Z',
      'EXECUTING',NULL,NULL,TRUE);`, 'duplicate key');
  rejects('a correction that does not name what it corrects is rejected',
    `INSERT INTO project.project_snapshot VALUES ('prj-1','2026-W35',1,'2026-08-25T09:00:00Z',
      'EXECUTING',NULL,NULL,TRUE);`, 'violates check');
  ok('a correction that names what it corrects is accepted',
    `INSERT INTO project.project_snapshot VALUES ('prj-1','2026-W35',1,'2026-08-25T09:00:00Z',
      'EXECUTING',0,'Cost feed restated',TRUE);
     SELECT count(*)::text FROM project.project_snapshot;`, '2');
  rejects('a malformed ISO week identifier is rejected',
    `INSERT INTO project.project_snapshot VALUES ('prj-1','2026-35x',0,'2026-08-24T09:00:00Z',
      'EXECUTING',NULL,NULL,TRUE);`, 'violates check');
  rejects('a financial snapshot violating the EAC identity is rejected',
    `INSERT INTO financial.financial_snapshot VALUES
      ('prj-1','2026-W35',0,'2026-08-24T09:00:00Z','HEALTH-v1','USD','SPOT',
       5200000,3100000,250000, 9999999, 10500000,280000,1950000,0.185714,2400000,450000,
       0.648379,0.128379,10000000,1450000,0.82,0.30,1882000,518000,4000000,0.15,TRUE);`,
    'violates check');
  rejects('a negative value at risk is rejected',
    `INSERT INTO financial.financial_snapshot VALUES
      ('prj-1','2026-W36',0,'2026-08-31T09:00:00Z','HEALTH-v1','USD','SPOT',
       5200000,3100000,250000, 8550000, 10500000,280000,1950000,0.185714,2400000,450000,
       0.648379,0.128379,10000000,1450000,0.82,0.30,1882000,-1,4000000,0.15,TRUE);`,
    'violates check');
  rejects('an unparameterised rule value with no blocker is rejected',
    `INSERT INTO rules.rule_definition VALUES ('HEALTH','HEALTH-v1','2026-08-31',NULL,'Health rules');
     INSERT INTO rules.rule_parameter VALUES ('HEALTH','HEALTH-v1','amberThreshold',NULL,'score',NULL);`,
    'violates check');

  // --- Step 7: recognised revenue history ----------------------------------
  group('7. Recognised revenue — append-only accounting corrections');
  ok('an ORIGINAL posting is accepted',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-1','prj-1','2026-04','ORIGINAL',420000.0000,420000.0000,'USD',NULL,NULL,
       'GL-001','1','RECOGNITION-v1','GL-001','2026-05-03T09:00:00Z','2026-05-04T09:00:00Z',TRUE);
     SELECT period_amount::text FROM financial.recognised_revenue_fact WHERE id='rrf-1';`, '420000.0000');
  rejects('an ORIGINAL that claims to supersede something is rejected',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-bad','prj-1','2026-04','ORIGINAL',1,1,'USD','rrf-1','rrf-1',
       'GL-BAD','1','RECOGNITION-v1','GL-BAD','2026-05-03T09:00:00Z','2026-05-04T09:00:00Z',TRUE);`,
    'violates check');
  rejects('an ADJUSTMENT that names nothing to supersede is rejected',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-bad2','prj-1','2026-04','ADJUSTMENT',-1,1,'USD',NULL,NULL,
       'GL-002','2','RECOGNITION-v1','GL-002','2026-07-01T09:00:00Z','2026-07-02T09:00:00Z',TRUE);`,
    'violates check');
  rejects('a posting that supersedes itself is rejected',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-self','prj-1','2026-04','ADJUSTMENT',-1,1,'USD','rrf-self','rrf-1',
       'GL-003','2','RECOGNITION-v1','GL-003','2026-07-01T09:00:00Z','2026-07-02T09:00:00Z',TRUE);`,
    'violates check');
  ok('an ADJUSTMENT is appended, naming its lineage',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-1-adj','prj-1','2026-04','ADJUSTMENT',-35000.0000,385000.0000,'USD','rrf-1','rrf-1',
       'GL-001','2','RECOGNITION-v1','GL-001-ADJ','2026-07-12T09:00:00Z','2026-07-13T09:00:00Z',TRUE);
     SELECT count(*)::text FROM financial.recognised_revenue_fact WHERE reporting_period_id='2026-04';`, '2');
  ok('a REVERSAL and a RESTATEMENT are appended',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-1-rev','prj-1','2026-04','REVERSAL',-385000.0000,0.0000,'USD','rrf-1-adj','rrf-1',
       'GL-001','3','RECOGNITION-v1','GL-001-REV','2026-09-01T09:00:00Z','2026-09-02T09:00:00Z',TRUE),
      ('rrf-1-res','prj-1','2026-04','RESTATEMENT',401000.0000,401000.0000,'USD','rrf-1-rev','rrf-1',
       'GL-001','4','RECOGNITION-v1','GL-001-RES','2026-09-01T10:00:00Z','2026-09-02T09:00:00Z',TRUE);
     SELECT count(*)::text FROM financial.recognised_revenue_fact WHERE reporting_period_id='2026-04';`, '4');
  ok('the ORIGINAL posting is byte-for-byte unchanged after three corrections',
    `SELECT period_amount::text||'|'||source_version||'|'||posting_type
     FROM financial.recognised_revenue_fact WHERE id='rrf-1';`, '420000.0000|1|ORIGINAL');
  rejects('UPDATE of any posting is rejected',
    `UPDATE financial.recognised_revenue_fact SET period_amount=1 WHERE id='rrf-1';`, 'insert-once');
  rejects('DELETE of any posting is rejected',
    `DELETE FROM financial.recognised_revenue_fact WHERE id='rrf-1';`, 'insert-once');
  rejects('a duplicate (source_record_id, source_version) is rejected',
    `INSERT INTO financial.recognised_revenue_fact VALUES
      ('rrf-dup','prj-1','2026-04','ADJUSTMENT',-1,1,'USD','rrf-1','rrf-1',
       'GL-001','2','RECOGNITION-v1','GL-DUP','2026-07-12T09:00:00Z','2026-07-13T09:00:00Z',TRUE);`,
    'duplicate key');
  ok('the effective position reconstructs from the authoritative sequence',
    `SELECT sum(period_amount)::text FROM financial.recognised_revenue_fact
     WHERE project_id='prj-1' AND reporting_period_id='2026-04';`, '401000.0000');
  ok('lineage resolves: every correction reaches an ORIGINAL sharing its source record',
    `SELECT count(*)::text FROM financial.recognised_revenue_fact c
     JOIN financial.recognised_revenue_fact o ON o.id = c.original_fact_id
     WHERE c.posting_type <> 'ORIGINAL' AND c.reporting_period_id='2026-04'
       AND o.posting_type='ORIGINAL' AND o.source_record_id = c.source_record_id
       AND c.source_timestamp > o.source_timestamp;`, '3');

  // --- Step 8: bounded-context boundaries ----------------------------------
  group('8. Schema and bounded-context boundaries');
  ok('no foreign key crosses a schema boundary',
    `SELECT count(*) FROM pg_constraint c
     JOIN pg_class t1 ON t1.oid=c.conrelid JOIN pg_namespace n1 ON n1.oid=t1.relnamespace
     JOIN pg_class t2 ON t2.oid=c.confrelid JOIN pg_namespace n2 ON n2.oid=t2.relnamespace
     WHERE c.contype='f' AND n1.nspname <> n2.nspname;`, 0);
  ok('within-context foreign keys exist where designed',
    `SELECT count(*) FROM pg_constraint WHERE contype='f';`, 26);
  ok('cross-context references are plain identifier columns, not FKs',
    `SELECT count(*) FROM information_schema.columns c
     WHERE c.table_schema='financial' AND c.column_name='project_id'
       AND NOT EXISTS (SELECT 1 FROM pg_constraint k
         WHERE k.contype='f' AND k.conrelid = (c.table_schema||'.'||c.table_name)::regclass
           AND 'project_id' = ANY (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid=k.conrelid AND a.attnum = ANY(k.conkey)));`, 6);

  // --- Step 9: transaction atomicity ---------------------------------------
  group('9. Transaction atomicity');
  ok('a multi-write authoritative transaction rolls back atomically',
    `DO $$
     BEGIN
       INSERT INTO contract.contract VALUES
         ('ctr-atomic','prj-1','cus-1','FIXED_BID','2025-06-01','2025-06-02','2027-01-29',
          NULL,NULL,NULL,30,TRUE);
       INSERT INTO contract.as_sold_baseline VALUES
         ('ctr-atomic','2025-06-01',5000000,3900000,250000,'USD','2027-01-29',
          0.3333,78.5,0.05,50000,TRUE);
       -- Fails: probability above 1. Everything above must roll back with it.
       INSERT INTO risk.risk VALUES ('rsk-atomic','prj-1','d','HIGH',2.0,1000,'USD',FALSE,NULL,
         '2026-09-01','OPEN','2026-01-01','2026-08-31T09:00:00Z',TRUE);
     EXCEPTION WHEN others THEN
       RAISE NOTICE 'rolled back: %', SQLERRM;
     END $$;
     SELECT count(*)::text FROM contract.contract WHERE id='ctr-atomic';`, '0');
  ok('no partial authoritative state survived the rollback',
    `SELECT (SELECT count(*) FROM contract.as_sold_baseline WHERE contract_id='ctr-atomic')::text
          ||'/'|| (SELECT count(*) FROM risk.risk WHERE id='rsk-atomic')::text;`, '0/0');

  // --- Step 10: declared indexes -------------------------------------------
  group('10. Declared indexes');
  ok('74 indexes exist after a clean migration',
    `SELECT count(*) FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema');`, 74);
  ok('the audit query indexes named by REQ-SEC-007 exist',
    `SELECT count(*) FROM pg_indexes WHERE schemaname='audit' AND tablename='audit_event';`, 4);
  // Primary key, the (source_record_id, source_version) uniqueness that stops a duplicate posting,
  // and the three declared lookups: period series, supersedes chain, original-fact lineage.
  ok('the recognised-revenue lineage indexes exist',
    `SELECT count(*) FROM pg_indexes
     WHERE schemaname='financial' AND tablename='recognised_revenue_fact';`, 5);
  ok('the correction chain is indexed in both directions',
    `SELECT count(*) FROM pg_indexes WHERE schemaname='financial'
       AND tablename='recognised_revenue_fact'
       AND (indexname LIKE '%supersedes%' OR indexname LIKE '%original_fact%');`, 2);
  ok('the weekly snapshot index exists',
    `SELECT count(*) FROM pg_indexes WHERE schemaname='project' AND tablename='project_snapshot';`, 2);

  report();
}

function report() {
  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `\n        ${r.detail}`}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed.`);
  if (failed.length > 0) process.exit(1);
}

run();
