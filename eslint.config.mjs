import tsParser from '@typescript-eslint/parser';
import boundaries from './architecture/eslint-plugin-boundaries.mjs';

/**
 * Flat config. Deliberately minimal: this repository's lint gate exists to enforce the
 * *architecture*, not house style. Formatting opinions belong nowhere near a build that
 * a CISO will read.
 */
export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'data/**'],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    plugins: { boundaries },
    rules: {
      'boundaries/no-forbidden-import': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Take time from the injected Clock (@platform/time) — ADR-0003 §5.' },
      ],
    },
  },
  {
    // platform/time is the single legitimate home for ambient system time.
    files: ['src/platform/time/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
];
