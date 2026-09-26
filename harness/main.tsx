import ReactDOM from 'react-dom/client'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    {Scene ? (
      <Scene />
    ) : (
      <p className="p-4 text-sm text-red-700">
        No scene called “{name}”. Try one of: {SCENE_NAMES.join(', ')}.
      </p>
    )}
  </ToastProvider>,
)
