import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * `npm run lint` existed in `package.json` for fifteen runs and could not run:
 * there was no config and ESLint was not installed, so the script failed with
 * a migration notice that read like a warning. A gate that cannot run is worse
 * than no gate — it is a gate everything passes.
 *
 * What it is for, given what already exists: `tsc` has types covered, the four
 * browser checks have behaviour covered, and 483 unit tests have the rules
 * covered. The gap those leave is the class of mistake that type-checks and
 * runs and is still wrong — a hook whose dependency list is a lie, a `let`
 * nothing reassigns, an unused import left behind by a refactor, an `any` that
 * quietly turns a typed call site into an untyped one.
 *
 * So this is deliberately small and honest: the recommended sets, and no
 * stylistic rules at all, because formatting is Prettier's argument and not
 * worth having twice.
 */
export default tseslint.config(
  {
    // Build output, and the two vendored things this repo does not own.
    ignores: ['dist*/', 'node_modules/', 'supabase/.temp/', 'coverage/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /*
       * The one rule worth more here than anywhere else. The board keeps its
       * conflict findings, tallies and drop hints in `useMemo`, and a stale
       * dependency there does not crash: it shows yesterday's conflicts next
       * to today's assignment, which is exactly the failure this app exists to
       * prevent and the one no test would catch.
       */
      'react-hooks/exhaustive-deps': 'error',
      /*
       * Off, rather than warned about fifteen times for ever. It asks for a
       * page's column definitions and helpers to move into files of their own
       * so the dev server can hot-reload the component — but those helpers are
       * imported by the mobile harness precisely so the check measures the
       * page's own columns rather than a copy, and a standing warning nobody
       * acts on is the same lie as a gate that cannot run.
       */
      'react-refresh/only-export-components': 'off',
      /*
       * `_ignored` is how this codebase says "destructured to drop it", which
       * `useApplySeedPlan` does to strip instructor ids off a section payload.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  {
    // The service worker and its client talk to APIs the DOM types do not
    // describe, and say so with narrow local interfaces rather than `any`.
    files: ['src/sw.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': 'off' },
  },

  {
    /*
     * The check scripts are Node programs that also contain browser code:
     * `page.evaluate(fn)` serialises a function and runs it inside Chromium,
     * where `document` and `getComputedStyle` are exactly as real as `fs` is
     * out here. Both sets of globals, therefore — the alternative is 26
     * `no-undef` errors on the lines that do the measuring.
     */
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'vite-plugins/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
)
