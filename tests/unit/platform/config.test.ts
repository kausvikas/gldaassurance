/**
 * Configuration — REQ-SEC-008 ("configuration is externalised"), REQ-UX-005 (demo marker).
 */
import { describe, expect, it } from 'vitest';
import { ConfigError, DEMO_DATA_BANNER, loadConfig } from '@platform/config';

describe('loadConfig', () => {
  it('defaults to the demo as-of date fixed by SYNTHETIC_DATA_SPEC.md §2', () => {
    expect(loadConfig({}).asOfDate).toBe('2026-08-31');
  });

  it('carries the DEMO — SYNTHETIC DATA marker as a constant, never a typed string', () => {
    expect(loadConfig({}).demoDataBanner).toBe(DEMO_DATA_BANNER);
    expect(DEMO_DATA_BANNER).toBe('DEMO — SYNTHETIC DATA');
  });

  it('rejects an unknown environment rather than falling back silently', () => {
    expect(() => loadConfig({ GLDI_ENV: 'production' })).toThrow(ConfigError);
  });

  it('rejects a malformed as-of date', () => {
    expect(() => loadConfig({ GLDI_AS_OF_DATE: '31/08/2026' })).toThrow(ConfigError);
  });

  it('accepts each declared environment', () => {
    for (const env of ['dev', 'test', 'staging', 'prod']) {
      expect(loadConfig({ GLDI_ENV: env }).environment).toBe(env);
    }
  });
});
