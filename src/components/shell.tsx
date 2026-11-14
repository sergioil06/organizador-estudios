import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { db, type Subject } from '../db'
import { useSubjects, useToday } from '../hooks'
import { onSyncState, type SyncState } from '../lib/sync'
import { createNote } from '../pages/SubjectDetail'
import { EventSheet } from './events'
import { Icon } from './Icon'
import { TaskSheet } from './tasks'
import { Sheet } from './ui'

export const NAV = [
  { to: '/', icon: 'home', label: 'Hoy' },
  { to: '/calendario', icon: 'calendar', label: 'Calendario' },
  { to: '/tareas', icon: 'tasks', label: 'Tareas' },
  { to: '/estudiar', icon: 'timer', label: 'Estudiar' },
  { to: '/asignaturas', icon: 'book', label: 'Asignaturas' },
]

/* ---------- Eventos globales: abrir la paleta o el menú de añadir desde cualquier sitio ---------- */
export const openPalette = () => window.dispatchEvent(new Event('open-palette'))
export const openQuickAdd = () => window.dispatchEvent(new Event('open-quick-add'))

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'

function useSync(): SyncState {
  const [s, setS] = useState<SyncState>({ status: 'off' })
  useEffect(() => onSyncState(setS) as unknown as () => void, [])
  return s
}

const SYNC_LABEL: Record<SyncState['status'], [string, string]> = {
  idle: ['Sincronizado con Google', 'var(--ok)'],
  syncing: ['Sincronizando…', 'var(--warn)'],
  error: ['Error al sincronizar', 'var(--danger)'],
  offline: ['Sin conexión', 'var(--faint)'],
  off: ['Solo en este dispositivo', 'var(--faint)'],
}

export function SideNav() {
  const day = useToday()
  const subjects = useSubjects().filter((s) => s.status === 'active')
  const sync = useSync()
  const pending = useLiveQuery(() => db.tasks.filter((t) => !t.done && !!t.due && t.due <= day).count(), [day], 0)
  const [label, color] = SYNC_LABEL[sync.status]

  return (
    <nav className="nav" aria-label="Secciones">
      <span className="brand">
        <span className="brand-logo" aria-hidden="true">Oe</span>
        Organizador
      </span>
      <button className="btn sm block nav-cta side-only" onClick={openQuickAdd}>
        <Icon name="plus" size={16} /> Añadir
        <span className="grow" />
        <span className="kbd" style={{ border: 0, color: 'var(--faint)' }}>N</span>
      </button>
      <button className="nav-link side-only" onClick={openPalette} style={{ background: 'none', border: 0, cursor: 'pointer', width: '100%' }}>
        <Icon name="search" size={18} />
        Buscar
        <span className="kbd">{MOD} K</span>
      </button>
      <span className="side-only" style={{ height: 8 }} />
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Icon name={n.icon} size={20} />
          {n.label}
          {n.to === '/tareas' && pending > 0 && <span className="badge-count">{pending}</span>}
        </NavLink>
      ))}

      <span className="nav-group label">Asignaturas</span>
      {subjects.map((s) => (
        <NavLink key={s.id} to={`/asignaturas/${s.id}`} className={({ isActive }) => `nav-link nav-subject side-only ${isActive ? 'active' : ''}`}>
          <span className="dot" style={{ background: s.color }} />
          {s.name}
        </NavLink>
      ))}
      <NavLink to="/subir" className={({ isActive }) => `nav-link nav-subject side-only ${isActive ? 'active' : ''}`}>
        <Icon name="upload" size={16} />
        Subir archivo
      </NavLink>

      <span className="spacer side-only" />
      <NavLink to="/ajustes" className={({ isActive }) => `nav-link side-only ${isActive ? 'active' : ''}`}>
        <Icon name="settings" size={18} />
        Ajustes
      </NavLink>
      <span className="sync-pill side-only" title={sync.message}>
        <span className="dot" style={{ background: color }} />
        {label}
      </span>
    </nav>
  )
}

/** Barra superior del móvil: marca, buscar y ajustes. */
export function TopBar() {
  return (
    <div className="topbar">
      <span className="brand-mark grow">
        <span className="brand-logo" aria-hidden="true">Oe</span>
      </span>
      <button className="btn icon ghost" onClick={openPalette} aria-label="Buscar">
        <Icon name="search" size={20} />
      </button>
      <NavLink to="/ajustes" className="btn icon ghost" aria-label="Ajustes">
        <Icon name="settings" size={20} />
      </NavLink>
    </div>
  )
}

type AddKind = 'task' | 'exam' | 'delivery' | 'note' | 'file'

/* ---------- Añadir rápido (botón + del móvil, "Añadir" del lateral, tecla N) ---------- */
export function QuickAdd() {
  const nav = useNavigate()
  const subjects = useSubjects()
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState<'task' | 'exam' | 'delivery' | null>(null)

  useEffect(() => {
    const on = () => setOpen(true)
    const onTask = () => setWhat('task')
    const onExam = () => setWhat('exam')
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return
      if (document.querySelector('.sheet-backdrop, .palette-backdrop')) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('open-quick-add', on)
    window.addEventListener('new-task', onTask)
    window.addEventListener('new-exam', onExam)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('open-quick-add', on)
      window.removeEventListener('new-task', onTask)
      window.removeEventListener('new-exam', onExam)
      document.removeEventListener('keydown', key)
    }
  }, [])

  const pick = async (k: AddKind) => {
    setOpen(false)
    if (k === 'note') nav(`/notas/${await createNote()}`)
    else if (k === 'file') nav('/subir')
    else setWhat(k)
  }

  const OPTIONS: [AddKind, string, string, string][] = [
    ['task', 'tasks', 'Tarea', 'Con fecha y prioridad'],
    ['exam', 'flag', 'Examen', 'Y su plan de estudio'],
    ['delivery', 'clock', 'Entrega', 'Práctica o trabajo'],
    ['note', 'note', 'Nota', 'Apuntes en Markdown'],
    ['file', 'upload', 'Archivo', 'PDF, foto o diapositivas'],
  ]

  return (
    <>
      <button className="fab" onClick={() => setOpen(true)} aria-label="Añadir">
        <Icon name="plus" size={26} />
      </button>
      {open && (
        <Sheet title="Añadir" onClose={() => setOpen(false)}>
          <div className="quick-grid">
            {OPTIONS.map(([k, icon, title, sub]) => (
              <button key={k} className="quick-btn" onClick={() => pick(k)} style={k === 'task' ? { gridColumn: '1 / -1' } : undefined}>
                <span className="qi"><Icon name={icon} size={18} /></span>
                <span className="stack" style={{ gap: 1 }}>
                  <b>{title}</b>
                  <span>{sub}</span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {what === 'task' && <TaskSheet subjects={subjects} onClose={() => setWhat(null)} />}
      {(what === 'exam' || what === 'delivery') && <EventSheet subjects={subjects} defaultKind={what} onClose={() => setWhat(null)} />}
    </>
  )
}

/* ---------- Paleta de comandos (Ctrl/⌘ + K) ---------- */
interface Cmd {
  id: string
  group: string
  label: string
  icon?: string
  color?: string
  hint?: string
  run: () => void
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function CommandPalette() {
  const nav = useNavigate()
  const subjects = useSubjects()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const on = () => setOpen(true)
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('open-palette', on)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('open-palette', on)
      document.removeEventListener('keydown', key)
    }
  }, [])
  useEffect(() => {
    if (!open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => nav(to)
    const fire = (ev: string) => () => window.dispatchEvent(new Event(ev))
    const list: Cmd[] = [
      { id: 'a-task', group: 'Acciones', label: 'Nueva tarea', icon: 'plus', run: fire('new-task') },
      { id: 'a-exam', group: 'Acciones', label: 'Nuevo examen', icon: 'flag', run: fire('new-exam') },
      { id: 'a-note', group: 'Acciones', label: 'Nueva nota', icon: 'note', run: async () => nav(`/notas/${await createNote()}`) },
      { id: 'a-file', group: 'Acciones', label: 'Subir archivo', icon: 'upload', run: go('/subir') },
      { id: 'a-pomo', group: 'Acciones', label: 'Empezar un Pomodoro', icon: 'timer', run: go('/estudiar?tab=pomodoro') },
      { id: 'a-plan', group: 'Acciones', label: 'Planificar un examen', icon: 'sparkle', run: go('/estudiar?tab=plan') },
      { id: 'a-cards', group: 'Acciones', label: 'Repasar flashcards', icon: 'layers', run: go('/estudiar?tab=flashcards') },
      ...NAV.map((n) => ({ id: `n-${n.to}`, group: 'Ir a', label: n.label, icon: n.icon, run: go(n.to) })),
      { id: 'n-ajustes', group: 'Ir a', label: 'Ajustes', icon: 'settings', run: go('/ajustes') },
      ...subjects
        .filter((s: Subject) => s.status === 'active' || s.status === 'upcoming')
        .map((s) => ({ id: `s-${s.id}`, group: 'Asignaturas', label: s.name, color: s.color, run: go(`/asignaturas/${s.id}`) })),
    ]
    return list
  }, [nav, subjects])

  const shown = useMemo(() => {
    const n = norm(q.trim())
    const base = n ? cmds.filter((c) => norm(c.label).includes(n)) : cmds
    return q.trim()
      ? [...base, { id: 'search', group: 'Buscar', label: `Buscar «${q.trim()}» en archivos, notas y tareas`, icon: 'search', run: () => nav(`/buscar?q=${encodeURIComponent(q.trim())}`) }]
      : base
  }, [cmds, q, nav])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  const run = (c: Cmd) => {
    setOpen(false)
    c.run()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); run(shown[sel]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  let lastGroup = ''
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar y acciones">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Busca una asignatura, una acción o un apunte…"
          aria-label="Buscar"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
        />
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {shown.map((c, i) => {
            const head = c.group !== lastGroup
            lastGroup = c.group
            return (
              <div key={c.id}>
                {head && <div className="palette-group label">{c.group}</div>}
                <button role="option" aria-selected={i === sel} className={`palette-item ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                  {c.color ? <span className="dot" style={{ background: c.color, margin: '0 5px' }} /> : <Icon name={c.icon ?? 'arrow'} size={18} />}
                  <span className="grow">{c.label}</span>
                  {i === sel && <span className="kbd">↵</span>}
                </button>
              </div>
            )
          })}
          {shown.length === 0 && <div className="empty">Nada coincide.</div>}
        </div>
      </div>
    </div>
  )
}
