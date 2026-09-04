/**
 * The module aliases, in one place.
 *
 * `vitest.config.ts` extends this rather than repeating it, and the container loads *this* file —
 * because the production image installs no test framework, and a config importing `vitest/config`
 * failed to load at start-up with a message about a file nobody expected the server to need.
 *
 * The aliases are the contract `tsconfig.json` declares and the architecture gate enforces. Two
 * copies of them would eventually disagree, and the disagreement would appear as a module resolving
 * differently under test than in production — which is the worst place for it.
 */
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export const ALIASES = {
  '@platform': r('./src/platform'),
  '@contexts': r('./src/contexts'),
  '@presentation': r('./src/presentation'),
  '@app': r('./src/app/index.ts'),
};

export default defineConfig({ resolve: { alias: ALIASES } });
