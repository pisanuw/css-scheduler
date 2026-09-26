/**
 * Builds the service worker, and decides which of the build's files it should
 * hold before anyone asks for them.
 *
 * There is a well-known plugin for this. It is not used here for two reasons
 * that both matter to this project: it brings Workbox, which is a larger
 * dependency than the ninety lines of worker it would generate, and it
 * generates that worker from configuration rather than source — which would
 * put the one part of the app that can serve itself wrongly forever outside
 * the reach of the unit tests and the review that everything else here gets.
 *
 * What it does instead:
 *
 *   - works out the shell — the entry chunk, everything it statically imports,
 *     the stylesheet, and the pages named in `pages`;
 *   - names the build by the hash of that list, which is a content address
 *     because every filename in it already contains its own file's hash;
 *   - bundles `src/sw.ts` with esbuild, substituting the list and the name;
 *   - emits it as `sw.js` at the root, unhashed, because a service worker can
 *     only control the scope it is served from.
 */
import { createHash } from 'node:crypto'
import { build as esbuild } from 'esbuild'
import type { Plugin, Rollup } from 'vite'

type OutputBundle = Rollup.OutputBundle
type OutputChunk = Rollup.OutputChunk

export interface PwaOptions {
  /** The worker's source, relative to the project root. */
  swSrc: string
  /**
   * Page chunks worth having before they are asked for, by chunk name.
   *
   * Deliberately short. Precaching all thirteen pages would download the whole
   * app to every visitor on every deploy, which is the cost the chunk split in
   * `vite.config.ts` was made to avoid. Anything not named here is cached the
   * first time it is opened, so a page the coordinator actually uses works
   * offline from then on.
   */
  pages?: string[]
}

function isChunk(value: OutputBundle[string]): value is OutputChunk {
  return value.type === 'chunk'
}

/** A chunk and everything it needs at load time, by output filename. */
function withStaticImports(bundle: OutputBundle, start: string, seen = new Set<string>()): Set<string> {
  if (seen.has(start)) return seen
  seen.add(start)
  const entry = bundle[start]
  if (entry && isChunk(entry)) {
    for (const next of entry.imports) withStaticImports(bundle, next, seen)
  }
  return seen
}

export function pwa(options: PwaOptions): Plugin {
  const pages = options.pages ?? []
  return {
    name: 'css-scheduler:pwa',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_output, bundle) {
      const files = new Set<string>()

      for (const [fileName, output] of Object.entries(bundle)) {
        if (isChunk(output)) {
          if (output.isEntry || (output.name && pages.includes(output.name))) {
            for (const needed of withStaticImports(bundle, fileName)) files.add(needed)
          }
        } else if (fileName.endsWith('.css')) {
          files.add(fileName)
        }
      }

      /*
       * `/index.html` rather than `/`: it is what the worker stores the shell
       * under and what it matches a navigation against, and Netlify's SPA
       * fallback serves the same bytes for both. Listed unconditionally
       * because the HTML asset may not have been emitted into the bundle yet
       * when this hook runs, and the shell is not optional.
       */
      const precache = ['/index.html', ...[...files].sort().map((f) => `/${f}`)]

      /*
       * The build's name. Every asset path in that list contains the hash of
       * its own contents, so the list changes if and only if the shell does —
       * which is exactly when a new cache is wanted. The worker's own source
       * is folded in so that a change to the caching rules alone still counts
       * as a new build.
       */
      const swSource = await esbuild({
        entryPoints: [options.swSrc],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        minify: true,
        legalComments: 'none',
        define: {
          __PRECACHE__: JSON.stringify(precache),
          // Replaced below, once the revision can include this very output.
          __REVISION__: JSON.stringify('__REVISION_PLACEHOLDER__'),
        },
      })
      const code = swSource.outputFiles[0]?.text
      if (!code) this.error('the service worker produced no output')

      const revision = createHash('sha256')
        .update(precache.join('\n'))
        .update(code!)
        .digest('hex')
        .slice(0, 12)

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: code!.replace('__REVISION_PLACEHOLDER__', revision),
      })
      this.info(`service worker: ${precache.length} files precached, revision ${revision}`)
    },
  }
}
