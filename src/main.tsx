import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initLoom } from './engine/loom'

initLoom()

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
