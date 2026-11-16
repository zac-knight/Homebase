import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { trackPointer } from './lib/effects'
import { applyAppearance } from './lib/theme'

applyAppearance()
trackPointer()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
