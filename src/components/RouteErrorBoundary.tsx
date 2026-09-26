import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RELOAD_FLAG, shouldAutoReload } from '../lib/chunkError'
import RouteErrorNotice from './RouteErrorNotice'

interface Props {
  /** Remounts the boundary when the route changes, so one bad page is not forever. */
  resetKey: string
  children: ReactNode
}

interface State {
  error: unknown
}

/**
 * The floor under a lazily loaded page. `src/lib/chunkError.ts` holds the two
 * rules — why a stale deploy reloads itself once and why nothing else does —
 * and `RouteErrorNotice` is what gets rendered; this only catches and obeys.
 *
 * A class, because an error boundary still has to be one: there is no hook
 * for `componentDidCatch`.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Keep the stack where a maintainer can find it; the coordinator gets prose.
    console.error('Route failed to render', error, info.componentStack)

    // Assume the worst if storage is unreadable: never risk a reload loop.
    let alreadyReloaded = true
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
    } catch {
      /* Safari in private mode throws on the getter. */
    }
    if (!shouldAutoReload(error, alreadyReloaded)) return
    try {
      sessionStorage.setItem(RELOAD_FLAG, '1')
    } catch {
      return // Cannot record the attempt, so do not make one.
    }
    window.location.reload()
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return <RouteErrorNotice error={this.state.error} />
  }
}
