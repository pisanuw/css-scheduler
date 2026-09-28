/**
 * Finding Playwright, for the checks that need a browser.
 *
 * It is not a dependency of this project: it is a ~150 MB install that the
 * unit tests, the build and the deploy have no use for, and making every
 * contributor pay for it to run `npm test` would be a poor trade. So the four
 * scripts that do need it resolve it from wherever it happens to be — a local
 * dev dependency if someone added one, the cloud sandbox's global install
 * otherwise — and say what to do when it is nowhere.
 *
 * Exit code 2, not 1: "this check could not run" is a different answer from
 * "this check failed", and a caller that cannot tell them apart will either
 * ignore real failures or block on a missing browser.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export function loadPlaywright(what) {
  const require = createRequire(import.meta.url)
  for (const spec of ['playwright', 'playwright-core', '@playwright/test']) {
    try {
      return require(spec)
    } catch {
      /* keep looking */
    }
  }
  // A global install is how the cloud sandbox has it.
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    return createRequire(join(root, 'x.js'))('playwright')
  } catch {
    /* fall through */
  }
  console.error(
    'Playwright is not installed:\n' +
      '    npm i -g playwright          (or `npm i -D playwright`, which puts it in package.json)\n' +
      '    playwright install chromium  (the browser build that package asks for)\n' +
      'Install the browsers with the same Playwright the checks resolve — `npx\n' +
      'playwright install` fetches a copy of its own and can leave the wrong\n' +
      `revision in the cache, which fails at launch instead of here. Skipping the ${what}.`,
  )
  process.exit(2)
}
