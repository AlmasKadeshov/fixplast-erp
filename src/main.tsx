import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// В продакшене консоль браузера должна быть пустой: ничего не раскрываем посторонним
if (import.meta.env.PROD) {
  for (const m of ['log', 'debug', 'info', 'warn', 'error', 'trace'] as const) console[m] = () => {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
