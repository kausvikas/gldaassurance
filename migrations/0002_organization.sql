-- 0002 — organization: hierarchy, regions, industries, customers, accounts, fiscal calendars.
-- Authority: REQ-DATA-001, REQ-SEC-003 (scope is expressed over this hierarchy).

CREATE TABLE organization.fiscal_calendar (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  -- OQ-5 is open. The calendar is DATA, so the open question does not block the schema.
  start_month        SMALLINT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
  year_label_prefix  TEXT NOT NULL DEFAULT 'FY',
  year_labelled_by   TEXT NOT NULL CHECK (year_labelled_by IN ('START_YEAR','END_YEAR'))
);

CREATE TABLE organization.node (
  id                  TEXT PRIMARY KEY,
  kind                TEXT NOT NULL CHECK (kind IN ('LEGAL_ENTITY','BUSINESS_UNIT','REGION','ACCOUNT')),
  name                TEXT NOT NULL,
  parent_id           TEXT REFERENCES organization.node(id),
  fiscal_calendar_id  TEXT REFERENCES organization.fiscal_calendar(id),
  synthetic           BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic),
  CHECK (id <> parent_id)
);

-- Append-only: an "as of" rollup must traverse the structure that existed then, not today's.
CREATE TABLE organization.hierarchy_snapshot (
  captured_at  TIMESTAMPTZ NOT NULL,
  child_id     TEXT NOT NULL,
  parent_id    TEXT NOT NULL,
  PRIMARY KEY (captured_at, child_id)
);
REVOKE UPDATE, DELETE ON organization.hierarchy_snapshot FROM gldi_app;
CREATE TRIGGER hierarchy_snapshot_is_append_only
  BEFORE UPDATE OR DELETE ON organization.hierarchy_snapshot
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();

CREATE TABLE organization.industry (code TEXT PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE organization.region (
  code                      TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  parent_business_unit_id   TEXT NOT NULL REFERENCES organization.node(id)
);

CREATE TABLE organization.customer (
  id             TEXT PRIMARY KEY,
  alias          TEXT NOT NULL,            -- fictional only (REQ-DATA-009)
  industry_code  TEXT NOT NULL REFERENCES organization.industry(code),
  region_code    TEXT NOT NULL REFERENCES organization.region(code),
  synthetic      BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);

CREATE TABLE organization.account (
  id                    TEXT PRIMARY KEY,
  customer_id           TEXT NOT NULL REFERENCES organization.customer(id),
  organization_node_id  TEXT NOT NULL REFERENCES organization.node(id),
  name                  TEXT NOT NULL,
  synthetic             BOOLEAN NOT NULL DEFAULT TRUE CHECK (synthetic)
);
