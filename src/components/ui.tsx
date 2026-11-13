import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Subject } from '../db'
import { Icon } from './Icon'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row">
          <h2 className="grow">{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SubjectSelect({
  subjects,
  value,
  onChange,
  id,
  allowNone = true,
}: {
  subjects: Subject[]
  value: string | undefined
  onChange: (v: string | undefined) => void
  id: string
  allowNone?: boolean
}) {
  const active = subjects.filter((s) => s.status === 'active' || s.id === value)
  const rest = subjects.filter((s) => !active.includes(s))
  return (
    <select id={id} className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowNone && <option value="">Sin asignatura</option>}
      {active.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
      {rest.length > 0 && (
        <optgroup label="Otras">
          {rest.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

/** Botón de borrar que pide un segundo toque para confirmar. */
export function ConfirmButton({ label = 'Borrar', confirm = '¿Seguro? Toca otra vez', onConfirm }: { label?: string; confirm?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button className="btn danger" style={armed ? { background: 'var(--danger-soft)' } : undefined} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirm : label}
    </button>
  )
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden="true" />
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

/* ---------- Avisos breves ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2600)
  }, [])
  useEffect(() => {
    const on = (e: Event) => show(String((e as CustomEvent).detail))
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [show])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/** Separa "a, b, c" en etiquetas limpias. */
export function parseTags(s: string): string[] {
  return [...new Set(s.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))]
}
