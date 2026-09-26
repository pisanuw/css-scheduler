import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker, shouldOfferUpdate, UPDATE_POLL_MS } from './swClient'
import type { ContainerLike, RegistrationLike, WorkerLike } from './swClient'
import { SKIP_WAITING } from './swStrategy'

/**
 * The browser, as far as this module can tell.
 *
 * A service worker's lifecycle cannot be reproduced by reloading a page — it
 * needs two versions, a tab that survives between them, and a network. Driving
 * it from fakes is the only way to assert the thing that actually matters:
 * that a new version is offered exactly when reloading would change something,
 * and never swaps itself in underneath somebody.
 */
class FakeWorker implements WorkerLike {
  state = 'installing'
  posted: unknown[] = []
  private listeners = new Set<() => void>()

  postMessage(message: unknown) {
    this.posted.push(message)
  }
  addEventListener(_type: 'statechange', listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: 'statechange', listener: () => void) {
    this.listeners.delete(listener)
  }
  get listening() {
    return this.listeners.size
  }
  become(state: string) {
    this.state = state
    for (const listener of [...this.listeners]) listener()
  }
}

class FakeRegistration implements RegistrationLike {
  installing: WorkerLike | null = null
  waiting: WorkerLike | null = null
  updates = 0
  updateResult: Promise<unknown> = Promise.resolve()
  private listeners = new Set<() => void>()

  addEventListener(_type: 'updatefound', listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: 'updatefound', listener: () => void) {
    this.listeners.delete(listener)
  }
  get listening() {
    return this.listeners.size
  }
  update() {
    this.updates++
    return this.updateResult
  }
  /** A new version arrives and begins installing. */
  findUpdate(worker: FakeWorker) {
    this.installing = worker
    for (const listener of [...this.listeners]) listener()
  }
}

class FakeContainer implements ContainerLike {
  controller: unknown = null
  registered: string[] = []
  registration = new FakeRegistration()
  failWith: unknown = null
  private listeners = new Set<() => void>()

  register(path: string): Promise<RegistrationLike> {
    this.registered.push(path)
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve(this.registration)
  }
  addEventListener(_type: 'controllerchange', listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: 'controllerchange', listener: () => void) {
    this.listeners.delete(listener)
  }
  get listening() {
    return this.listeners.size
  }
  /** The waiting worker takes over. */
  swapController() {
    this.controller = { id: 'new' }
    for (const listener of [...this.listeners]) listener()
  }
}

function setup(container: FakeContainer) {
  const offered: Array<() => void> = []
  const reload = vi.fn()
  const onError = vi.fn()
  const timers: Array<{ fn: () => void; ms: number }> = []
  const cleared: unknown[] = []
  const done = registerServiceWorker({
    container,
    onUpdateReady: (apply) => offered.push(apply),
    reload,
    onError,
    setInterval: (fn, ms) => {
      timers.push({ fn, ms })
      return timers.length
    },
    clearInterval: (handle) => cleared.push(handle),
  })
  return { offered, reload, onError, timers, cleared, done }
}

describe('shouldOfferUpdate', () => {
  it('waits for the new worker to finish installing', () => {
    expect(shouldOfferUpdate('installing', true)).toBe(false)
    expect(shouldOfferUpdate('installed', true)).toBe(true)
  })

  it('says nothing on a first install, because nothing would change', () => {
    // No controller means the page is already running this very version.
    expect(shouldOfferUpdate('installed', false)).toBe(false)
  })

  it('ignores a worker that was discarded', () => {
    expect(shouldOfferUpdate('redundant', true)).toBe(false)
    expect(shouldOfferUpdate('activated', true)).toBe(false)
  })
})

describe('registerServiceWorker', () => {
  it('registers at the root, so the worker can answer every route', async () => {
    const container = new FakeContainer()
    const { done } = setup(container)
    await done
    expect(container.registered).toEqual(['/sw.js'])
  })

  it('offers nothing when the app installs for the first time', async () => {
    const container = new FakeContainer() // no controller: nothing is running yet
    const { offered, done } = setup(container)
    await done

    const worker = new FakeWorker()
    container.registration.findUpdate(worker)
    worker.become('installed')

    expect(offered).toHaveLength(0)
  })

  it('offers an update that installed behind a running version, and applies it once', async () => {
    const container = new FakeContainer()
    container.controller = { id: 'old' }
    const { offered, reload, done } = setup(container)
    await done

    const worker = new FakeWorker()
    container.registration.findUpdate(worker)
    worker.become('installed')
    expect(offered).toHaveLength(1)

    // Nothing has happened yet: the offer is an offer.
    expect(worker.posted).toEqual([])
    expect(reload).not.toHaveBeenCalled()

    offered[0]!()
    expect(worker.posted).toEqual([{ type: SKIP_WAITING }])
    // Still not reloaded — the new worker has to take over first, or the
    // reload lands on the old version and looks like an update that failed.
    expect(reload).not.toHaveBeenCalled()

    container.swapController()
    expect(reload).toHaveBeenCalledTimes(1)

    // A second tab accepting the same update must not reload this one again.
    container.swapController()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('offers a worker that was already waiting when the page opened', async () => {
    const container = new FakeContainer()
    container.controller = { id: 'old' }
    const waiting = new FakeWorker()
    waiting.state = 'installed'
    container.registration.waiting = waiting

    const { offered, done } = setup(container)
    await done
    expect(offered).toHaveLength(1)
  })

  it('offers a worker that was installed before we started listening', async () => {
    const container = new FakeContainer()
    container.controller = { id: 'old' }
    const { offered, done } = setup(container)
    await done

    // `updatefound` fires and the state is already 'installed' by the time the
    // listener runs — a race the browser is entitled to win.
    const worker = new FakeWorker()
    worker.state = 'installed'
    container.registration.findUpdate(worker)

    expect(offered).toHaveLength(1)
  })

  it('says nothing about a waiting worker on a page nothing controls', async () => {
    const container = new FakeContainer()
    const waiting = new FakeWorker()
    waiting.state = 'installed'
    container.registration.waiting = waiting

    const { offered, done } = setup(container)
    await done
    expect(offered).toHaveLength(0)
  })

  it('reports a browser that refuses to register, and carries on', async () => {
    const container = new FakeContainer()
    container.failWith = new Error('The operation is insecure.')
    const { onError, done } = setup(container)
    const stop = await done

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }))
    expect(() => stop()).not.toThrow()
  })

  it('survives an environment that registers nothing at all', async () => {
    const container = new FakeContainer()
    // Resolving with nothing is off-specification and happens anyway.
    container.register = () => Promise.resolve(undefined as unknown as RegistrationLike)
    const { onError, offered, done } = setup(container)
    const stop = await done

    expect(onError).toHaveBeenCalledTimes(1)
    expect(offered).toHaveLength(0)
    expect(() => stop()).not.toThrow()
  })

  it('asks on a timer whether a new version has shipped', async () => {
    const container = new FakeContainer()
    const { timers, cleared, done } = setup(container)
    const stop = await done

    expect(timers).toHaveLength(1)
    expect(timers[0]!.ms).toBe(UPDATE_POLL_MS)
    timers[0]!.fn()
    expect(container.registration.updates).toBe(1)

    stop()
    expect(cleared).toEqual([1])
  })

  it('shrugs off a check that fails because the connection is down', async () => {
    const container = new FakeContainer()
    container.registration.updateResult = Promise.reject(new Error('Failed to fetch'))
    const { timers, done } = setup(container)
    await done
    timers[0]!.fn()
    // An unhandled rejection here would fail this test run, which is the point.
    await Promise.resolve()
  })

  it('takes back every listener it added', async () => {
    const container = new FakeContainer()
    container.controller = { id: 'old' }
    const { offered, done } = setup(container)
    const stop = await done

    const worker = new FakeWorker()
    container.registration.findUpdate(worker)
    worker.become('installed')
    offered[0]!()
    expect(container.listening).toBe(1)

    stop()
    expect(container.registration.listening).toBe(0)
    expect(container.listening).toBe(0)
    expect(worker.listening).toBe(0)

    // And nothing it stopped listening to can still reach it.
    container.registration.findUpdate(new FakeWorker())
    expect(offered).toHaveLength(1)
  })
})
