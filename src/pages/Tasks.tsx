import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, uid, type Subject, type Task } from '../db'
import { Icon } from '../components/Icon'
import { TaskItem, TaskSheet } from '../components/tasks'
import { Dot, Empty, useToast } from '../components/ui'
import { useSubjects, useToday } from '../hooks'
import { addDays, formatShort, startOfWeek, weekday, WEEKDAYS } from '../lib/dates'

type View = 'hoy' | 'semana' | 'todas'

/** Entiende "entregar hoja 5 el viernes", "repasar mañana", "… para el 3/12" y "#cálculo". */
export function parseQuickTask(text: string, day: string, subjects: Subject[]) {
  let title = text.trim()
  let due: string | undefined
  let subjectId: string | undefined
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  const rules: [RegExp, () => string][] = [
    [/\b(para )?(hoy)\b/i, () => day],
    [/\b(para )?(pasado mañana)\b/i, () => addDays(day, 2)],
    [/\b(para )?(mañana)\b/i, () => addDays(day, 1)],
  ]
  for (const [re, fn] of rules) {
    if (re.test(title)) {
      due = fn()
      title = title.replace(re, '')
      break
    }
  }
  if (!due) {
    const nt = norm(title)
    const wdNorm = WEEKDAYS.map(norm)
    const wd = wdNorm.findIndex((w) => new RegExp(`\\b${w}\\b`).test(nt))
    if (wd >= 0) {
      const diff = (wd + 1 - weekday(day) + 7) % 7 || 7
      due = addDays(day, diff)
      title = title.replace(new RegExp(`(?:para el |el )?(?:${WEEKDAYS[wd]}|${wdNorm[wd]})`, 'i'), '')
    }
  }
  if (!due) {
    const m = title.match(/\b(?:el |para el )?(\d{1,2})\/(\d{1,2})\b/)
    if (m) {
      const y = Number(day.slice(0, 4))
      const cand = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      due = cand < day ? `${y + 1}${cand.slice(4)}` : cand
      title = title.replace(m[0], '')
    }
  }
  const tag = title.match(/#(\S+)/)
  if (tag) {
    const t = norm(tag[1])
    subjectId = subjects.find((s) => norm(s.short).startsWith(t) || norm(s.name).startsWith(t))?.id
    title = title.replace(tag[0], '')
  }
  if (!subjectId) {
    const n = norm(title)
    subjectId = subjects.filter((s) => s.status === 'active').find((s) => n.includes(norm(s.short)))?.id
  }
  return { title: title.replace(/\s{2,}/g, ' ').trim(), due, subjectId }
}

export default function Tasks() {
  const day = useToday()
  const subjects = useSubjects()
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const toast = useToast()
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[])
  const [view, setView] = useState<View>('hoy')
  const [subject, setSubject] = useState<string>('')
  const [open, setOpen] = useState<Task | 'new' | null>(null)
  const [quick, setQuick] = useState('')

  const weekEnd = addDays(startOfWeek(day), 6)
  const inView = (t: Task) => {
    if (subject && t.subjectId !== subject) return false
    if (view === 'todas') return true
    if (view === 'hoy') return !!t.due && t.due <= day
    return !!t.due && t.due <= weekEnd
  }
  const pending = tasks.filter((t) => !t.done && inView(t)).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || prio(a) - prio(b))
  const doneToday = tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString() && (!subject || t.subjectId === subject))
  const noDate = view !== 'todas' ? tasks.filter((t) => !t.done && !t.due && (!subject || t.subjectId === subject)) : []

  const count = (v: View) =>
    tasks.filter((t) => !t.done && (v === 'todas' || (t.due && t.due <= (v === 'hoy' ? day : weekEnd)))).length

  const addQuick = async () => {
    if (!quick.trim()) return
    const p = parseQuickTask(quick, day, subjects)
    if (!p.title) return
    await db.tasks.add({ id: uid(), title: p.title, due: p.due ?? (view === 'hoy' ? day : undefined), subjectId: p.subjectId ?? (subject || undefined), priority: 'medium', done: false, subtasks: [], createdAt: Date.now() })
    setQuick('')
    toast(`Añadida${p.due ? ` para ${formatShort(p.due)}` : ''}`)
  }

  // Agrupar por día en la vista de semana / todas
  const groups = new Map<string, Task[]>()
  for (const t of pending) {
    const key = !t.due ? 'Sin fecha' : t.due < day ? 'Vencidas' : t.due === day ? 'Hoy' : formatShort(t.due)
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tareas</h1>
        <button className="btn sm primary" onClick={() => setOpen('new')}>
          <Icon name="plus" size={16} /> Nueva
        </button>
      </div>

      <div className="segmented" role="tablist" aria-label="Vista">
        {(
          [
            ['hoy', 'Hoy'],
            ['semana', 'Esta semana'],
            ['todas', 'Todas'],
          ] as [View, string][]
        ).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {l} · {count(v)}
          </button>
        ))}
      </div>

      <div className="chips">
        <button className={`chip ${subject === '' ? 'on' : ''}`} onClick={() => setSubject('')}>
          Todas
        </button>
        {subjects
          .filter((s) => s.status === 'active')
          .map((s) => (
            <button key={s.id} className={`chip ${subject === s.id ? 'on' : ''}`} onClick={() => setSubject(s.id)}>
              <Dot color={s.color} /> {s.short}
            </button>
          ))}
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          addQuick()
        }}
      >
        <label htmlFor="quick" className="sr-only">Añadir tarea rápida</label>
        <input id="quick" className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Ej. entregar hoja 5 de cálculo el viernes" />
        <button className="btn icon primary" aria-label="Añadir">
          <Icon name="plus" />
        </button>
      </form>

      {pending.length === 0 ? (
        <div className="card">
          <Empty>{view === 'hoy' ? 'Nada para hoy.' : 'No hay tareas pendientes aquí.'}</Empty>
        </div>
      ) : (
        [...groups.entries()].map(([g, list]) => (
          <section key={g} className="stack" style={{ gap: 6 }}>
            <span className="label" style={g === 'Vencidas' ? { color: 'var(--danger)' } : undefined}>{g}</span>
            <div className="card list">
              {list.map((t) => (
                <TaskItem key={t.id} task={t} subject={t.subjectId ? byId.get(t.subjectId) : undefined} onOpen={() => setOpen(t)} />
              ))}
            </div>
          </section>
        ))
      )}

      {noDate.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <span className="label">Sin fecha</span>
          <div className="card list">
            {noDate.map((t) => (
              <TaskItem key={t.id} task={t} subject={t.subjectId ? byId.get(t.subjectId) : undefined} onOpen={() => setOpen(t)} />
            ))}
          </div>
        </section>
      )}

      {doneToday.length > 0 && (
        <section className="stack" style={{ gap: 6 }}>
          <span className="label">Hechas hoy · {doneToday.length}</span>
          <div className="card list">
            {doneToday.map((t) => (
              <TaskItem key={t.id} task={t} subject={t.subjectId ? byId.get(t.subjectId) : undefined} onOpen={() => setOpen(t)} />
            ))}
          </div>
        </section>
      )}

      {open && <TaskSheet task={open === 'new' ? undefined : open} defaultSubjectId={subject || undefined} defaultDue={view === 'hoy' && open === 'new' ? day : undefined} subjects={subjects} onClose={() => setOpen(null)} />}
    </div>
  )
}

function prio(t: Task) {
  return t.priority === 'high' ? 0 : t.priority === 'medium' ? 1 : 2
}
