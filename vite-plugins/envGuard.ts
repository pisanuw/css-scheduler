import type { Plugin } from 'vite'

/**
 * Refuses to build without the Supabase environment values.
 *
 * Not a convenience. `src/lib/supabase.ts` throws at module scope when
 * `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing — deliberately, so
 * a misconfigured deploy says so on the first paint rather than on the first
 * query. Vite inlines both values at build time, so with neither of them set
 * that condition folds to a constant and the module provably throws on import.
 *
 * Rollup shipped the module anyway and the app failed loudly in the browser.
 * Rolldown, which Vite 8 builds with, is cleverer: it proves that everything
 * the entry reaches after that import is unreachable and eliminates all of it.
 * The build then succeeds, prints its usual table of chunks, and emits an entry
 * of 2.5 kB containing a module-preload polyfill and nothing else. Every page
 * chunk survives, because those arrive through dynamic imports; only the app
 * shell is gone. `npm run build` is one of this project's three verification
 * gates, and without this plugin it passes on a bundle with no application in
 * it — the kind of green check this project has already been burned by once,
 * with a Netlify deploy that printed success and shipped nothing.
 *
 * Checked here, against the cause, rather than by inspecting the bundle for the
 * symptom. The obvious alternative — assert the app's modules are in the output
 * — does not work: `chunk.moduleIds` still lists `src/App.tsx` after its code
 * has been eliminated, because the module was reached and then emptied. A size
 * threshold would need revising every time the shell grew and would not say
 * what was wrong. The absence of two environment variables is unambiguous, and
 * an app that cannot reach its database is not a useful artifact whatever the
 * bundler does with it.
 */
export function envGuard(keys: string[]): Plugin {
  return {
    name: 'css-scheduler:env-guard',
    // Build only: `vite dev` is where somebody discovers they have no `.env.local`,
    // and the runtime error already names the file to copy.
    apply: 'build',
    configResolved(config) {
      const missing = keys.filter((key) => !config.env[key])
      if (missing.length === 0) return

      throw new Error(
        `Refusing to build without ${missing.join(' and ')}.\n\n` +
          'Vite inlines these at build time, and `src/lib/supabase.ts` throws at ' +
          'module scope when they are absent — which lets the bundler prove the ' +
          'whole app shell is unreachable and drop it. The build would otherwise ' +
          'have succeeded and emitted a bundle with no application in it.\n\n' +
          'Any syntactically valid values will do for a build that is only being ' +
          'checked: `npm run check:routes` and `npm run check:pwa` pass ' +
          'placeholders for exactly this reason. A build made for comparison ' +
          'against what Netlify serves needs the real ones.',
      )
    },
  }
}
