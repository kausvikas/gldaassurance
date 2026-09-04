/**
 * Test configuration. The aliases come from `vite.config.ts`, which the container also loads, so
 * a module cannot resolve differently under test than it does in production.
 */
import { defineConfig } from 'vitest/config';
import { ALIASES } from './vite.config.js';

export default defineConfig({
  resolve: { alias: ALIASES },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    reporters: ['default'],
  },
});
