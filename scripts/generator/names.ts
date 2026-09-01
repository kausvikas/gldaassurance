/**
 * Fictional naming pools.
 *
 * `SYNTHETIC_DATA_SPEC.md` G6 / REQ-DATA-009: no real client names, no real people, no near-misses
 * on real GlobalLogic accounts. Every name below is invented; the validator checks the generated
 * corpus against a deny-list of real-company tokens so an accidental collision fails the build
 * rather than reaching a demo.
 *
 * People are referenced by synthetic persona handles (`psn-0417`), never by a generated human name.
 * That is stricter than the spec requires and removes the question of whether a generated name
 * happens to match a real employee (`SECURITY_MODEL.md` §8).
 */

export const VERTICALS = [
  'Mobility',
  'Industrial & Energy',
  'Media & Entertainment',
  'Technology',
  'Financial Services',
  'Healthcare & Life Sciences',
  'Communications',
  'Retail & Consumer',
] as const;
export type Vertical = (typeof VERTICALS)[number];

/** Business unit → the geographies beneath it (ADR-0013 §3: two axes, not one). */
export const BUSINESS_UNITS = [
  { id: 'bu-americas', name: 'Americas', regions: ['North America', 'LATAM'] },
  { id: 'bu-emea', name: 'EMEA', regions: ['Europe'] },
  { id: 'bu-apac', name: 'APAC', regions: ['India/APAC'] },
] as const;

export const REGION_CURRENCY: Readonly<Record<string, 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY'>> = {
  'North America': 'USD',
  LATAM: 'USD',
  Europe: 'EUR',
  'India/APAC': 'INR',
};

/** Invented corporate aliases, two per vertical. */
export const CLIENT_ALIASES: Readonly<Record<Vertical, readonly string[]>> = {
  Mobility: ['Meridian Automotive', 'Kestrel Mobility Group'],
  'Industrial & Energy': ['Ardent Industrial', 'Tholen Energy Systems'],
  'Media & Entertainment': ['Vireo Media', 'Larkspur Studios'],
  Technology: ['Quillon Technologies', 'Halcyon Compute'],
  'Financial Services': ['Calder Financial', 'Brennick Capital'],
  'Healthcare & Life Sciences': ['Northwind MedTech', 'Aventine Biosciences'],
  Communications: ['Halden Telco', 'Sable Communications'],
  'Retail & Consumer': ['Ospry Retail Group', 'Fenwick Consumer Brands'],
};

/** `<Client> <Capability> <Phase>` per `SYNTHETIC_DATA_SPEC.md` §4. */
export const CAPABILITIES = [
  'Connected Platform', 'Data Modernisation', 'Customer Portal', 'Core Replatform',
  'Field Operations Suite', 'Digital Commerce', 'Analytics Foundation', 'Device Management',
  'Claims Automation', 'Network Assurance', 'Content Pipeline', 'Regulatory Reporting',
  'Supply Visibility', 'Payments Gateway', 'Diagnostics Workbench', 'Fleet Telemetry',
] as const;

export const PHASES = ['R1', 'R2', 'R3', 'Phase 1', 'Phase 2', 'Wave 1', 'Wave 2'] as const;

/** Company names that must never appear. Checked by the validator over the whole corpus. */
export const REAL_WORLD_DENY_LIST = [
  'globallogic', 'hitachi', 'accenture', 'infosys', 'wipro', 'cognizant', 'capgemini',
  'tcs', 'tata', 'ibm', 'deloitte', 'epam', 'luxoft', 'thoughtworks', 'endava',
  'google', 'microsoft', 'amazon', 'apple', 'meta', 'oracle', 'sap', 'salesforce',
  'ford', 'toyota', 'bmw', 'daimler', 'volkswagen', 'siemens', 'bosch', 'ge ',
  'pfizer', 'novartis', 'roche', 'jpmorgan', 'citibank', 'hsbc', 'barclays',
  'verizon', 'vodafone', 'comcast', 'disney', 'netflix', 'walmart', 'tesco',
] as const;
