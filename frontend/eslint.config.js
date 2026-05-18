// ESLint 9 flat config — TypeScript + React Hooks + Prettier
//
// Run:
//   pnpm lint        # check
//   pnpm lint --fix  # auto-fix safe issues
//
// We intentionally keep this minimal:
// - typescript-eslint recommended rules (catches most TS bugs)
// - react-hooks rules (Rules of Hooks, deps array)
// - prettier last (disables stylistic rules that conflict with Prettier)
//
// Heavy rules (jsx-a11y, react full set) come later if we need them. Goal
// for PR 3 scaffold: ESLint runs without errors against an empty src/ tree.

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  {
    // Narrowed (reviewer Gemini #3257443985): ignore only generated /
    // vendored output. Build configs (vite.config.ts / vitest.config.ts /
    // eslint.config.js) should be lint-checked too.
    ignores: ['dist', 'node_modules', 'coverage', 'public'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  prettier,
];
