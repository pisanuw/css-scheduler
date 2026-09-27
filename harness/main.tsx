import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../src/components/Toast'
import { SCENES, SCENE_NAMES } from './scenes'
import './harness.css'

// The check script reads this rather than keeping its own list of scenes.
declare global {
  interface Window {
    __SCENES__: string[]
  }
}
window.__SCENES__ = SCENE_NAMES

const name = new URLSearchParams(location.search).get('view') ?? SCENE_NAMES[0]!
const Scene = SCENES[name]

/*
 * A router around everything, because components that offer a way out render a
 * `<Link>` and a Link outside a router throws. Nothing here navigates — the
 * memory router exists so the scenes can hold real links rather than fakes that
 * would let a broken one through.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <ToastProvider>
    {Scene ? (
      <Scene />
    ) : (
      <p className="p-4 text-sm text-red-700">
        No scene called “{name}”. Try one of: {SCENE_NAMES.join(', ')}.
      </p>
    )}
    </ToastProvider>
  </MemoryRouter>,
)
