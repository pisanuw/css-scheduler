import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

/*
 * `npm run lint` existed as a script for a long time with no config behind it,
 * which is worse than no gate at all: it reads like a check that runs.
 *
 * The rules are chosen to catch what this project has actually got wrong, not
 * to enforce a house style. Formatting is left alone entirely — nothing here
 * reflows code, so lint and build never disagree about a file.
 *
 * `tsc` already owns unused locals, unused parameters, fallthrough cases and
 * unchecked index access (see `tsconfig.json`), so those are not duplicated
 * here beyond what a preset brings for free.
 */
export default tseslint.config(
  {
    /*
     * Build output and generated files. `src/lib/database.types.ts` is written
     * by `supabase gen types`; linting it would mean either editing a generated
     * file or carrying suppressions that regeneration drops on the floor.
     */
    ignores: [
      'dist/',
      'dist-*/',
      'harness/dist/',
      'node_modules/',
      'public/',
      'supabase/',
      'past-course-schedules/',
      'src/lib/database.types.ts',
    ],
  },

  // Everything: the baseline JavaScript rules.
  js.configs.recommended,
  {
    // The same `_`-means-deliberate convention the TypeScript rule below uses,
    // so the two halves of the codebase do not disagree about it.
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  /*
   * The application, the harness and the Vite plugins — every TypeScript file
   * `tsconfig.json` includes. Type-aware, because the rules worth having here
   * (a promise nobody awaited, a condition that is always true) cannot be
   * decided from syntax alone.
   */
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      /*
       * A `void` prefix is how this codebase says "deliberately not awaited",
       * which is the common case in an event handler.
       */
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      // `_` marks a binding kept for its position rather than its value.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' },
      ],
      /*
       * An `async` function passed to `onClick` or `onSubmit` is how every
       * handler in this app is written, and React ignores what a handler
       * returns. The rest of the rule is kept, because a promise passed
       * somewhere a `void` is expected in ordinary code — a `forEach` callback,
       * say — really is a bug.
       */
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      /*
       * Off, and the reason is a gap rather than a preference: no
       * `src/lib/database.types.ts` has ever been generated, so
       * `supabase.from(...)` is typed with `any` rows and every `const { data }
       * = await ...` is an unsafe assignment. The codebase's answer is a cast
       * at the boundary (`data as Scenario`), which is visible and checked by
       * everything downstream of it.
       *
       * The real fix is `npm run db:types`, which needs a linked Supabase CLI
       * this sandbox does not have. Until then the rule would report nine
       * findings nobody can act on. Its sharper relatives —
       * `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`,
       * `no-unsafe-argument` — stay on, and they are the ones that catch an
       * `any` being *used* rather than merely received.
       */
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  /*
   * React rules, for the files that render. `react-hooks` is the reason this
   * config is worth its weight: two of the bugs recorded in
   * `docs/PROGRESS.md` were a stale closure and an over-wide dependency array,
   * and both are what these rules are for.
   */
  {
    files: ['src/**/*.{ts,tsx}', 'harness/**/*.tsx'],
    /*
     * `configs.recommended` is still the eslintrc shape in v7 (its `plugins`
     * is an array of names); `configs.flat.recommended` is the same rule set
     * for flat config. Picking the wrong one fails at startup, loudly, which
     * is the good kind of mistake.
     */
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      /*
       * v7 ships the React Compiler's rules alongside the classic two. Most are
       * worth having. These two are not, and it is worth saying exactly why
       * rather than leaving a bare `off`:
       *
       * `refs` — eleven findings, ten of them the same false positive.
       * `useRowDrag` in `LoadPanel.tsx` returns an object whose `ref` key holds
       * dnd-kit's `setNodeRef` callback. The rule sees a property called `ref`
       * read during render and says "cannot access refs during render"; there
       * is no ref object anywhere near it.
       *
       * The eleventh, in `useShortcuts.ts`, was the real one, and it has been
       * fixed rather than accepted — an earlier version of this comment called
       * it deliberate and safe, which was wrong. Writing `latest.current` in the
       * render body mutates the ref even on a render React throws away, so the
       * listener could read state from a render that never committed. It is
       * written in an effect now. Turning the rule on to catch the next one of
       * those still costs ten false positives in `LoadPanel`, so it stays off
       * and this paragraph is the record.
       */
      'react-hooks/refs': 'off',
      /*
       * `set-state-in-effect` — on, and with nothing grandfathered. It shipped
       * off, with five named findings recorded as debt rather than dismissed,
       * because clearing it meant reworking five components' state flow and
       * that is its own piece of work rather than something to do under a lint
       * gate. It has since been done, and all five were real:
       *
       * - `Board.tsx` defaulted the selected quarter in an effect and
       *   `Compare.tsx` defaulted its two sides, so each rendered once with
       *   nothing selected — an empty tab strip and section list for a frame,
       *   and the "choose two different scenarios" notice appearing before the
       *   defaults landed. Both read `chosen ?? first` now.
       * - `Layout.tsx` closed the nav drawer in an effect on navigation, which
       *   commits the new page with the drawer still over it and closes it a
       *   frame later. Adjusted during render instead.
       * - `auth.tsx` cleared the profile when the session went. A profile is a
       *   round trip to `profiles` and cannot be computed during render, but
       *   *whose* profile it is can be recorded next to it — so nothing is
       *   cleared and `resolveProfile` compares. That also closed a hole the
       *   effect had: for one render after an account switch the previous
       *   user's profile was still the current one.
       * - `MyPreferences.tsx` hydrated an editable form from the saved
       *   submission, and this is the one the rule is actually about. Because
       *   the effect ran whenever the query's data changed, the refetch that
       *   follows a saved draft put the saved answers back over anything typed
       *   since the tap. The form is seeded at mount and remounted by key now,
       *   so a refetch of the same submission cannot touch it, and
       *   `scripts/route_check.mjs` fails against the old page.
       *
       * The rule found a data-loss bug that nobody had reported. It is an
       * error from here.
       */
      'react-hooks/set-state-in-effect': 'error',
      /*
       * Promoted from the warning it ships as. This is the rule with the best
       * record on this codebase — a stale `openNew` closure and a `keydown`
       * listener rebuilt on every keystroke are both in `docs/PROGRESS.md` —
       * and it has no findings left to grandfather, so there is nothing to pay
       * for making it a gate. A missing dependency is a bug that shows up as
       * the board acting on a quarter the coordinator has already left, which
       * is the kind nobody reports because it reads as their own mistake.
       */
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  /*
   * `react-refresh` only has something to say about modules Vite hot-reloads,
   * so it is scoped to the app rather than the harness or the tests.
   */
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      /*
       * Off, rather than warned about fourteen times for ever. It asks for a
       * page's column definitions and helpers to move into files of their own
       * so the dev server can hot-reload the component — but those helpers are
       * imported by the mobile harness precisely so the check measures the
       * page's own columns rather than a copy. `Courses.tsx` says so on the
       * line above the export, and `harness/scenes.tsx` imports it. So the
       * warnings are permanent by design, and a standing warning nobody can act
       * on is the same lie as a gate that cannot run.
       *
       * The plugin is kept registered rather than dropped: its other rules
       * still apply, and turning this one off by name records the decision
       * where the next person will look for it.
       */
      'react-refresh/only-export-components': 'off',
    },
  },

  /*
   * The service worker is neither a window nor a Node process. Without this it
   * is a file full of undefined globals.
   */
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },

  /*
   * Vitest's globals are enabled in `tsconfig.json` via `vitest/globals`; the
   * linter needs telling separately.
   */
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      /*
       * An `async` test body with nothing to await is how a test that only
       * builds a promise reads best, and `vitest` is happy either way.
       */
      '@typescript-eslint/require-await': 'off',
      /*
       * A test double exists partly to reject with the wrong sort of thing.
       * `swClient.test.ts` rejects with whatever it was configured with, which
       * is how `messageOf` and `isOfflineError` get tested against a Postgrest
       * error object rather than only against `Error`.
       */
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
    },
  },

  /*
   * The check scripts: Node, run by hand or by `npm run check:*`, and outside
   * `tsconfig.json` on purpose. Plain rules only — there is no type
   * information to lint against, and adding them to the program would mean
   * type-checking Playwright's selectors as application code.
   */
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      /*
       * Both, and not by accident. These files are Node programs that also
       * contain browser code: the callback passed to `page.evaluate()` is
       * serialised and run inside Chromium, so `document`, `window` and
       * `getComputedStyle` are genuinely defined where they appear — 55 of the
       * first run's findings were this, and every one of them was the linter
       * not knowing which side of the bridge a function body lands on.
       *
       * The cost is that a real typo in the Node half goes unreported if it
       * happens to name a browser global. Worth it: the alternative is 55
       * false positives, and a gate nobody trusts is the thing this config
       * exists to stop being.
       */
      globals: { ...globals.node, ...globals.browser },
      sourceType: 'module',
      ecmaVersion: 'latest',
    },
  },

  // The Vite configs are Node, not browser.
  {
    files: ['vite.config.ts', 'harness/vite.config.ts', 'vite-plugins/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // This file.
  {
    files: ['eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
)
