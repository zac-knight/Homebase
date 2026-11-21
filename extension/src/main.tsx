import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { WaveIntro, introWanted } from './components/Waves'
import './index.css'
import { trackPointer } from './lib/effects'
import { applyAppearance } from './lib/theme'

applyAppearance()
trackPointer()
// The backdrop starts transparent and fades in once the opening waves are mostly through, so
// it is the last thing to arrive. --intro is how long the content waits for them.
const intro = introWanted()
const root = document.documentElement
if (intro) {
  root.style.setProperty('--intro', '1.05s')
  root.style.setProperty('--row-base', '0.75s')
  setTimeout(() => {
    root.style.setProperty('--intro', '0s')
    root.style.setProperty('--row-base', '0s')
  }, 3000)
}
setTimeout(() => (root.dataset.ready = ''), intro ? 900 : 30)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {intro && <WaveIntro />}
    <App />
  </StrictMode>,
)
