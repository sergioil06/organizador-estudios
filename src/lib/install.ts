/**
 * Botón de «Instalar». Guardamos el aviso de instalación del navegador nada más arrancar
 * (antes se escuchaba desde Ajustes y a veces llegaba tarde) y sin bloquear el aviso propio de Chrome.
 */
import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installEvent: InstallEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    installEvent = e as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    notify()
  })
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => void listeners.delete(l)
  }, [])
  return {
    canInstall: !!installEvent,
    async prompt() {
      const ev = installEvent
      if (!ev) return
      installEvent = null // el aviso solo se puede usar una vez
      notify()
      await ev.prompt()
      await ev.userChoice.catch(() => undefined)
    },
  }
}
