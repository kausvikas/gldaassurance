import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@platform': r('./src/platform'),
      '@contexts': r('./src/contexts'),
      '@presentation': r('./src/presentation'),
      '@app': r('./src/app/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    reporters: ['default'],
  },
});
