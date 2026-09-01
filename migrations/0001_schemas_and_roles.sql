-- 0001 — schema per bounded context, and the application role's privileges.
-- Authority: ADR-0001 §Decision 3 (schema per context, no cross-context FKs), ADR-0007.

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS portfolio;
CREATE SCHEMA IF NOT EXISTS project;
CREATE SCHEMA IF NOT EXISTS contract;
CREATE SCHEMA IF NOT EXISTS financial;
CREATE SCHEMA IF NOT EXISTS delivery;
CREATE SCHEMA IF NOT EXISTS commercial;
CREATE SCHEMA IF NOT EXISTS quality;
CREATE SCHEMA IF NOT EXISTS resource;
CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS assurance;
CREATE SCHEMA IF NOT EXISTS recovery;
CREATE SCHEMA IF NOT EXISTS health;
CREATE SCHEMA IF NOT EXISTS forecast;
CREATE SCHEMA IF NOT EXISTS rules;
CREATE SCHEMA IF NOT EXISTS data_quality;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS audit;

-- The application connects as this role. It is never the owner, so it cannot ALTER away a
-- constraint or a trigger it dislikes (SECURITY_MODEL.md §2 B6).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gldi_app') THEN
    CREATE ROLE gldi_app NOLOGIN;
  END IF;
END $$;

-- Schema USAGE. Without it every table GRANT later in this chain is dead: the role cannot reach the
-- schema, so it cannot exercise the SELECT/INSERT it was granted, and the REVOKE of UPDATE/DELETE
-- proves nothing because the role had no access to begin with.
--
-- Found by the DR-012 verification run: the authored grants existed but were unexercisable. This is
-- the minimum correction that makes the *already designed* privilege model executable. It grants
-- schema traversal only — no table privileges are added here, and the per-table GRANT/REVOKE
-- statements in later migrations remain the sole source of table access.
GRANT USAGE ON SCHEMA
  identity, organization, portfolio, project, contract, financial, delivery, commercial,
  quality, resource, risk, assurance, recovery, health, forecast, rules, data_quality,
  integration, audit
TO gldi_app;

-- Reusable guard. Attached to every insert-once table (ADR-0007 §Decision 3, control 2 of 2).
CREATE OR REPLACE FUNCTION audit.reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Table %.% is insert-once. A correction is a new record, never an update or delete '
    '(ADR-0003 Decision 1, REQ-DATA-003).', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- Money is NUMERIC everywhere. A DOMAIN so a float column cannot be introduced by habit.
CREATE DOMAIN financial.money_amount AS NUMERIC(18, 4);
CREATE DOMAIN financial.rate_amount  AS NUMERIC(12, 6);
CREATE DOMAIN financial.currency_code AS CHAR(3)
  CHECK (VALUE IN ('USD', 'EUR', 'GBP', 'INR', 'JPY'));

-- A ratio stored as NUMERIC with an explicit NULL meaning NOT_COMPUTABLE. Never NaN, never a
-- sentinel zero (ADR-0002 §Decision 8, METRIC_CATALOG §1.1 rule 5).
CREATE DOMAIN financial.ratio AS NUMERIC(12, 6);
