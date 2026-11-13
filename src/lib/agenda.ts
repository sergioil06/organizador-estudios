import type { CalEvent, ClassSlot, Subject, Task } from '../db'
import { addDays, daysBetween, weekday } from './dates'

export interface AgendaItem {
  key: string
  date: string
  start?: string
  end?: string
  title: string
  detail: string
  color: string
  source: 'class' | 'event' | 'task'
  kind?: CalEvent['kind']
  refId: string
}

const FALLBACK = '#8FA8FF'

/** Todo lo que pasa entre `from` y `to` (ambos incluidos), ordenado por fecha y hora. */
export function buildAgenda(
  from: string,
  to: string,
  classes: ClassSlot[],
  events: CalEvent[],
  tasks: Task[],
  subjects: Subject[],
): AgendaItem[] {
  const byId = new Map(subjects.map((s) => [s.id, s]))
  const items: AgendaItem[] = []
  const span = daysBetween(from, to)

  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i)
    const wd = weekday(date)
    for (const c of classes) {
      if (c.weekday !== wd || date < c.from || date > c.until) continue
      const s = byId.get(c.subjectId)
      if (!s || s.status !== 'active') continue
      items.push({
        key: `c-${c.id}-${date}`,
        date,
        start: c.start,
        end: c.end,
        title: s.short,
        detail: `${c.type} · ${c.room}`,
        color: s.color,
        source: 'class',
        refId: c.id,
      })
    }
  }

  for (const e of events) {
    if (e.date < from || e.date > to) continue
    const s = e.subjectId ? byId.get(e.subjectId) : undefined
    items.push({
      key: `e-${e.id}`,
      date: e.date,
      start: e.start || undefined,
      end: e.end || undefined,
      title: e.title,
      detail: [s?.short, e.place].filter(Boolean).join(' · '),
      color: s?.color ?? FALLBACK,
      source: 'event',
      kind: e.kind,
      refId: e.id,
    })
  }

  for (const t of tasks) {
    if (!t.due || t.done || t.due < from || t.due > to) continue
    const s = t.subjectId ? byId.get(t.subjectId) : undefined
    items.push({
      key: `t-${t.id}`,
      date: t.due,
      title: t.title,
      detail: s ? `Tarea · ${s.short}` : 'Tarea',
      color: s?.color ?? FALLBACK,
      source: 'task',
      refId: t.id,
    })
  }

  return items.sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date) : (a.start ?? '00:00').localeCompare(b.start ?? '00:00'),
  )
}
