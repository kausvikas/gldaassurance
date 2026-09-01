/**
 * ESLint plugin — editor-time feedback for the same rules the CI gate enforces.
 *
 * It deliberately does *not* re-implement anything: it calls `evaluateImport` from
 * `ruleset.mjs`, so the editor, `npm run check:architecture` and
 * `tests/integration/architecture.boundaries.test.ts` can never disagree about what the
 * architecture is. `check.mjs` remains the authority — this exists so a violation is visible
 * while it is being written rather than at push time.
 */
import { relative } from 'node:path';
import { REPO_ROOT, evaluateImport } from './ruleset.mjs';

const noForbiddenImport = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce the bounded-context and layer dependency rules declared in architecture/manifest.json (ADR-0001 §4.1).',
    },
    schema: [],
    messages: {
      violation: '{{code}}: {{message}} (authority: {{authority}})',
    },
  },
  create(context) {
    const file = relative(REPO_ROOT, context.filename ?? context.getFilename()).split('\\').join('/');

    const check = (node, specifier) => {
      if (typeof specifier !== 'string') return;
      for (const v of evaluateImport(file, specifier)) {
        context.report({
          node,
          messageId: 'violation',
          data: { code: v.code, message: v.message, authority: v.authority },
        });
      }
    };

    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => node.source && check(node, node.source.value),
      ImportExpression: (node) =>
        node.source.type === 'Literal' && check(node, node.source.value),
    };
  },
};

export default {
  meta: { name: 'gldi-boundaries', version: '1.0.0' },
  rules: { 'no-forbidden-import': noForbiddenImport },
};
