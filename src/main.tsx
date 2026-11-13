import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { installSyncHooks, scheduleSync } from './lib/sync'

installSyncHooks()

// Sincroniza al abrir, al volver a la app, al recuperar internet y cada pocos minutos.
scheduleSync(1500)
window.addEventListener('online', () => scheduleSync(500))
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(500))
setInterval(() => document.visibilityState === 'visible' && scheduleSync(0), 3 * 60_000)

// Actualiza la app sola cuando publico una versión nueva.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
